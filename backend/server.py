from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Response, Query, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import requests
import subprocess
import tempfile
import json
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
CAMB_API_KEY = os.environ.get('CAMB_API_KEY')

APP_NAME = "khmer-dubbing"
LOCAL_STORAGE_DIR = Path("/app/uploads")
LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Background task queue
processing_queue = asyncio.Queue()
queue_status = {}  # project_id -> {"position": int, "status": "queued"|"processing"|"done"|"error"}

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def put_object(path: str, data: bytes, content_type: str) -> dict:
    file_path = LOCAL_STORAGE_DIR / path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "wb") as f:
        f.write(data)
    return {"path": path, "size": len(data)}

def get_object(path: str) -> tuple:
    file_path = LOCAL_STORAGE_DIR / path
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    with open(file_path, "rb") as f:
        data = f.read()
    ext = path.split(".")[-1].lower() if "." in path else ""
    content_types = {
        "mp4": "video/mp4", "mov": "video/quicktime", "avi": "video/x-msvideo",
        "mp3": "audio/mpeg", "wav": "audio/wav", "m4a": "audio/mp4",
        "webm": "video/webm", "mkv": "video/x-matroska", "flac": "audio/flac"
    }
    return data, content_types.get(ext, "application/octet-stream")

def get_file_type(filename: str) -> str:
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    if ext in ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv']:
        return 'video'
    elif ext in ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']:
        return 'audio'
    return 'unknown'

def get_media_duration(file_path: str) -> float:
    """Get media duration in seconds using ffprobe"""
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", file_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return float(result.stdout.strip())
    except (ValueError, AttributeError):
        return 0.0

def merge_audio_with_video(video_path: str, audio_path: str, output_path: str):
    cmd = [
        "ffmpeg", "-y", "-i", video_path, "-i", audio_path,
        "-c:v", "copy", "-map", "0:v:0", "-map", "1:a:0",
        "-shortest", output_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"FFmpeg error: {result.stderr}")

def burn_subtitles_into_video(video_path: str, srt_path: str, audio_path: str, output_path: str):
    """Burn subtitles and replace audio in one FFmpeg pass"""
    cmd = [
        "ffmpeg", "-y", "-i", video_path, "-i", audio_path,
        "-vf", f"subtitles={srt_path}:force_style='FontName=Noto Sans Khmer,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,MarginV=30'",
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest", output_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        logger.warning(f"Subtitle burn failed, falling back to audio-only merge: {result.stderr}")
        merge_audio_with_video(video_path, audio_path, output_path)

def generate_srt(segments: list) -> str:
    """Generate SRT subtitle file content from segments"""
    srt_lines = []
    for i, seg in enumerate(segments):
        if not seg.get("translated"):
            continue
        start = seg.get("start", 0)
        end = seg.get("end", start + 3)
        start_ts = f"{int(start//3600):02d}:{int((start%3600)//60):02d}:{int(start%60):02d},{int((start%1)*1000):03d}"
        end_ts = f"{int(end//3600):02d}:{int((end%3600)//60):02d}:{int(end%60):02d},{int((end%1)*1000):03d}"
        srt_lines.append(f"{i+1}")
        srt_lines.append(f"{start_ts} --> {end_ts}")
        srt_lines.append(seg["translated"])
        srt_lines.append("")
    return "\n".join(srt_lines)

def adjust_pitch(input_path: str, output_path: str, pitch_semitones: int):
    """Adjust audio pitch using FFmpeg without changing speed.
    pitch_semitones: negative = deeper/older, positive = higher/younger
    Range: -12 to +12 semitones
    """
    if pitch_semitones == 0:
        import shutil
        shutil.copy2(input_path, output_path)
        return
    ratio = 2 ** (pitch_semitones / 12.0)
    atempo = 1.0 / ratio
    atempo_filters = []
    t = atempo
    while t > 2.0:
        atempo_filters.append("atempo=2.0")
        t /= 2.0
    while t < 0.5:
        atempo_filters.append("atempo=0.5")
        t *= 2.0
    atempo_filters.append(f"atempo={t:.4f}")
    filter_chain = f"asetrate=44100*{ratio:.4f},aresample=44100," + ",".join(atempo_filters)
    cmd = ["ffmpeg", "-y", "-i", input_path, "-af", filter_chain, output_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        logger.warning(f"Pitch adjustment failed: {result.stderr}")
        import shutil
        shutil.copy2(input_path, output_path)

# FastAPI app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: str

class ProjectCreate(BaseModel):
    title: str

class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    original_text: Optional[str] = None
    voice: Optional[str] = None
    female_voice: Optional[str] = None
    male_voice: Optional[str] = None
    segments: Optional[List[dict]] = None
    actors: Optional[List[dict]] = None

class TranslateRequest(BaseModel):
    chinese_text: str

LANGUAGE_NAMES = {
    "zh": "Chinese", "th": "Thai", "vi": "Vietnamese", "ko": "Korean",
    "ja": "Japanese", "en": "English", "km": "Khmer", "lo": "Lao",
    "my": "Burmese", "id": "Indonesian", "ms": "Malay", "fr": "French",
    "de": "German", "es": "Spanish", "pt": "Portuguese", "ru": "Russian",
    "ar": "Arabic", "hi": "Hindi", "tl": "Tagalog", "it": "Italian",
}

# Auth
async def get_current_user(authorization: str = Header(None)) -> User:
    token = None
    if authorization:
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**user)

@api_router.get("/")
async def root():
    return {"message": "Khmer Dubbing API"}

# Auth endpoints
@api_router.post("/auth/session")
async def create_session(session_id: str = Header(..., alias="X-Session-ID")):
    async with httpx.AsyncClient() as http:
        resp = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session ID")
        data = resp.json()
    existing = await db.users.find_one({"email": data["email"]}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": data["name"], "picture": data.get("picture")}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": data["email"], "name": data["name"],
            "picture": data.get("picture"), "created_at": datetime.now(timezone.utc).isoformat()
        })
    session_token = data.get("session_token") or f"sess_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_token}

@api_router.get("/auth/me")
async def get_me(authorization: str = Header(None)):
    user = await get_current_user(authorization)
    return user.model_dump()

@api_router.post("/auth/logout")
async def logout(authorization: str = Header(None)):
    token = None
    if authorization:
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    return {"success": True}

# Project CRUD
@api_router.post("/projects")
async def create_project(project: ProjectCreate, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project_id = f"proj_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "project_id": project_id, "user_id": user.user_id, "title": project.title,
        "file_type": "text", "original_file_path": None, "original_filename": None,
        "extracted_audio_path": None, "original_text": None, "translated_text": None,
        "dubbed_audio_path": None, "dubbed_video_path": None, "segments": [], "actors": [],
        "status": "created", "voice": "sophea", "female_voice": "sophea", "male_voice": "dara",
        "detected_language": None, "share_token": None,
        "created_at": now, "updated_at": now
    }
    await db.projects.insert_one(doc)
    return await db.projects.find_one({"project_id": project_id}, {"_id": 0})

@api_router.get("/projects")
async def list_projects(authorization: str = Header(None)):
    user = await get_current_user(authorization)
    return await db.projects.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api_router.get("/projects/{project_id}")
async def get_project(project_id: str, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@api_router.patch("/projects/{project_id}")
async def update_project(project_id: str, update: ProjectUpdate, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.projects.update_one({"project_id": project_id}, {"$set": update_data})
    return await db.projects.find_one({"project_id": project_id}, {"_id": 0})

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    result = await db.projects.delete_one({"project_id": project_id, "user_id": user.user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True}

# Duplicate project
@api_router.post("/projects/{project_id}/duplicate")
async def duplicate_project(project_id: str, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    new_id = f"proj_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    new_doc = {**project}
    new_doc["project_id"] = new_id
    new_doc["title"] = f"{project['title']} (Copy)"
    new_doc["share_token"] = None
    new_doc["dubbed_audio_path"] = None
    new_doc["dubbed_video_path"] = None
    new_doc["status"] = "translated" if project.get("segments") and any(s.get("translated") for s in project.get("segments", [])) else "transcribed" if project.get("segments") else "created"
    new_doc["created_at"] = now
    new_doc["updated_at"] = now
    await db.projects.insert_one(new_doc)
    return await db.projects.find_one({"project_id": new_id}, {"_id": 0})

# Merge segments
class MergeRequest(BaseModel):
    segment_ids: List[int]

@api_router.post("/projects/{project_id}/merge-segments")
async def merge_segments(project_id: str, req: MergeRequest, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    segments = project.get("segments", [])
    ids = sorted(req.segment_ids)
    if len(ids) < 2 or any(i < 0 or i >= len(segments) for i in ids):
        raise HTTPException(status_code=400, detail="Invalid segment IDs")
    # Merge: take first start, last end, concat text
    merged_seg = {
        "id": ids[0],
        "start": segments[ids[0]].get("start", 0),
        "end": segments[ids[-1]].get("end", 0),
        "original": " ".join(segments[i].get("original", "") for i in ids).strip(),
        "translated": " ".join(segments[i].get("translated", "") for i in ids).strip(),
        "speaker": segments[ids[0]].get("speaker", "SPEAKER_00"),
        "gender": segments[ids[0]].get("gender", "female"),
        "voice": segments[ids[0]].get("voice", "sophea"),
    }
    new_segments = []
    skip = set(ids)
    for i, seg in enumerate(segments):
        if i == ids[0]:
            new_segments.append(merged_seg)
        elif i not in skip:
            new_segments.append(seg)
    # Re-index
    for i, seg in enumerate(new_segments):
        seg["id"] = i
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"segments": new_segments, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return await db.projects.find_one({"project_id": project_id}, {"_id": 0})

# Split segment
class SplitRequest(BaseModel):
    segment_id: int

@api_router.post("/projects/{project_id}/split-segment")
async def split_segment(project_id: str, req: SplitRequest, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    segments = project.get("segments", [])
    idx = req.segment_id
    if idx < 0 or idx >= len(segments):
        raise HTTPException(status_code=400, detail="Invalid segment ID")
    seg = segments[idx]
    mid_time = (seg.get("start", 0) + seg.get("end", 0)) / 2
    orig = seg.get("original", "")
    trans = seg.get("translated", "")
    # Split text at midpoint
    orig_words = orig.split() if " " in orig else list(orig)
    trans_words = trans.split() if " " in trans else list(trans)
    mid_o = len(orig_words) // 2
    mid_t = len(trans_words) // 2
    joiner_o = " " if " " in orig else ""
    joiner_t = " " if " " in trans else ""
    seg1 = {**seg, "end": round(mid_time, 1), "original": joiner_o.join(orig_words[:mid_o]) if orig_words else "", "translated": joiner_t.join(trans_words[:mid_t]) if trans_words else ""}
    seg2 = {**seg, "start": round(mid_time, 1), "original": joiner_o.join(orig_words[mid_o:]) if orig_words else "", "translated": joiner_t.join(trans_words[mid_t:]) if trans_words else ""}
    seg2.pop("custom_audio", None)
    seg1.pop("custom_audio", None)
    new_segments = segments[:idx] + [seg1, seg2] + segments[idx+1:]
    for i, s in enumerate(new_segments):
        s["id"] = i
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"segments": new_segments, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return await db.projects.find_one({"project_id": project_id}, {"_id": 0})

# File upload
@api_router.post("/projects/{project_id}/upload")
async def upload_file(project_id: str, file: UploadFile = File(...), authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    file_type = get_file_type(file.filename)
    if file_type == 'unknown':
        raise HTTPException(status_code=400, detail="Unsupported file type")
    data = await file.read()
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{user.user_id}/{project_id}/{uuid.uuid4().hex}.{ext}"
    result = put_object(path, data, file.content_type or "application/octet-stream")
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "original_file_path": result["path"], "original_filename": file.filename,
            "file_type": file_type, "status": "uploaded",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return await db.projects.find_one({"project_id": project_id}, {"_id": 0})

# Upload actor voice
@api_router.post("/projects/{project_id}/upload-actor-voice")
async def upload_actor_voice(project_id: str, file: UploadFile = File(...), actor_id: str = Form(""), authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    data = await file.read()
    ext = file.filename.split(".")[-1] if "." in file.filename else "wav"
    path = f"{APP_NAME}/custom_audio/{user.user_id}/{project_id}/actor_{actor_id}_{uuid.uuid4().hex}.{ext}"
    result = put_object(path, data, file.content_type or "audio/wav")
    actors = project.get("actors", [])
    for actor in actors:
        if actor["id"] == actor_id:
            actor["custom_voice"] = result["path"]
            break
    segments = project.get("segments", [])
    for seg in segments:
        if seg.get("speaker") == actor_id:
            seg["custom_audio"] = result["path"]
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"actors": actors, "segments": segments, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"voice_path": result["path"], "actor_id": actor_id}

# Upload segment audio
@api_router.post("/projects/{project_id}/upload-segment-audio")
async def upload_segment_audio(project_id: str, file: UploadFile = File(...), segment_id: int = 0, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    data = await file.read()
    ext = file.filename.split(".")[-1] if "." in file.filename else "wav"
    path = f"{APP_NAME}/custom_audio/{user.user_id}/{project_id}/segment_{segment_id}_{uuid.uuid4().hex}.{ext}"
    result = put_object(path, data, file.content_type or "audio/wav")
    segments = project.get("segments", [])
    if segment_id < len(segments):
        segments[segment_id]["custom_audio"] = result["path"]
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"segments": segments, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    return {"audio_path": result["path"], "segment_id": segment_id}

# Transcribe with segments + speaker detection + smart actor labels
@api_router.post("/projects/{project_id}/transcribe-segments")
async def transcribe_segments(project_id: str, authorization: str = Header(None)):
    from emergentintegrations.llm.openai import OpenAISpeechToText
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.get("original_file_path"):
        raise HTTPException(status_code=400, detail="No file uploaded")

    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"status": "transcribing", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    try:
        file_data, _ = get_object(project["original_file_path"])
        with tempfile.TemporaryDirectory() as temp_dir:
            ext = project["original_filename"].split(".")[-1] if "." in project["original_filename"] else "mp4"
            input_path = os.path.join(temp_dir, f"input.{ext}")
            audio_path = os.path.join(temp_dir, "audio.wav")
            with open(input_path, "wb") as f:
                f.write(file_data)

            cmd = ["ffmpeg", "-y", "-i", input_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audio_path]
            subprocess.run(cmd, capture_output=True)

            # Helper: Analyze voice pitch per segment for gender detection
            def analyze_pitch(wav_path, start_sec, end_sec):
                """Extract audio segment and analyze pitch to detect male/female voice"""
                import wave
                import struct
                try:
                    with wave.open(wav_path, 'r') as wf:
                        rate = wf.getframerate()
                        start_frame = int(start_sec * rate)
                        end_frame = int(end_sec * rate)
                        n_frames = end_frame - start_frame
                        if n_frames <= 0:
                            return None
                        wf.setpos(max(0, start_frame))
                        frames = wf.readframes(min(n_frames, rate * 10))
                        samples = struct.unpack(f'<{len(frames)//2}h', frames)
                        if len(samples) < 320:
                            return None
                        
                        # Zero-crossing rate for pitch estimation
                        crossings = 0
                        for i in range(1, len(samples)):
                            if (samples[i] >= 0) != (samples[i-1] >= 0):
                                crossings += 1
                        
                        duration = len(samples) / rate
                        if duration <= 0:
                            return None
                        zcr = crossings / (2 * duration)
                        
                        # Male voice: ~85-180 Hz, Female voice: ~165-255 Hz
                        return "male" if zcr < 160 else "female"
                except Exception as e:
                    logger.warning(f"Pitch analysis failed: {e}")
                    return None

            stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
            with open(audio_path, "rb") as audio_file:
                response = await stt.transcribe(file=audio_file, model="whisper-1", response_format="verbose_json")

            # Auto-detect language from Whisper response
            detected_lang = getattr(response, 'language', None) or 'zh'
            detected_lang_name = LANGUAGE_NAMES.get(detected_lang, detected_lang)
            logger.info(f"Auto-detected language: {detected_lang} ({detected_lang_name})")

            raw_segments = response.segments if hasattr(response, 'segments') else []
            
            # Step 1: Merge short segments into natural sentences
            # Whisper sometimes splits into tiny 1-second chunks — merge them
            merged = []
            current = None
            for seg in raw_segments:
                text = seg.get('text', '').strip()
                start = seg.get('start', 0)
                end = seg.get('end', 0)
                if not text:
                    continue
                if current is None:
                    current = {"start": start, "end": end, "text": text}
                else:
                    gap = start - current["end"]
                    current_len = current["end"] - current["start"]
                    # Merge if: gap < 0.5s AND current segment < 5s AND text is short
                    if gap < 0.5 and current_len < 5.0 and len(current["text"]) < 40:
                        current["end"] = end
                        current["text"] += text
                    else:
                        merged.append(current)
                        current = {"start": start, "end": end, "text": text}
            if current:
                merged.append(current)
            
            logger.info(f"Merged {len(raw_segments)} raw segments into {len(merged)} natural segments")
            
            segments = []
            for i, seg in enumerate(merged):
                segments.append({
                    "id": i,
                    "start": round(seg["start"], 1),
                    "end": round(seg["end"], 1),
                    "original": seg["text"],
                    "translated": "",
                    "speaker": "SPEAKER_00",
                    "gender": "female",
                    "voice": "sophea"
                })

            # Step 2: Detect speakers using GPT (text-based, more reliable than pitch)
            if segments:
                detect_chat = LlmChat(
                    api_key=EMERGENT_LLM_KEY,
                    session_id=f"detect_{project_id}_{uuid.uuid4().hex[:6]}",
                    system_message="""You analyze video dialogue to identify speakers, their GENDER, ROLE, and estimated AGE.

CRITICAL GENDER RULES:
- Characters with titles 爷/哥/先生/老板/少爷/大哥 = MALE
- Characters with titles 姐/妹/女士/太太/老婆/小姐 = FEMALE  
- 老子/我(aggressive) = MALE speaker
- 弟弟 = MALE (younger brother)
- 姐姐 = FEMALE (older sister)
- 九爷 = MALE, 少爷 = MALE
- Aggressive/commanding speech (滚/找死/给我滚/狗东西) = usually MALE
- Most drama conversations have BOTH male AND female characters
- If unsure about gender, look at HOW they speak: commanding/rough = male, gentle/polite = could be either

SPEAKER GROUPING:
- Use SPEAKER_00, SPEAKER_01, SPEAKER_02 etc.
- Different conversation turns = different speakers  
- Same person consecutive lines = same ID
- When someone is ADDRESSED by title, the REPLY is a different person

AGE ESTIMATION:
- Look at how the character speaks and their role
- 爷/奶奶/老 = elderly (60+)
- 叔/阿姨/太太/老板 = middle age (35-55)
- 哥/姐/先生/女士 = adult (25-40)
- 弟弟/妹妹/小 = young (15-25)
- Narrators/voiceover = adult (25-35) unless obvious
- If character name is given (e.g. 杜清禾), estimate from context

ROLE DETECTION:
- Identify the character's role: Narrator, Boss, Wife, Doctor, Student, etc.
- If character has a proper name (e.g. 杜清禾), translate or romanize it to English (e.g. "Du Qinghe")
- 旁白/自述 = Narrator
- ALL role names MUST be in English. Never return Chinese characters in the role field.

IMPORTANT: You MUST identify at least some speakers as "male" if the dialogue contains male characters.

Return ONLY JSON array:
[{"idx": 0, "speaker": "SPEAKER_00", "gender": "male", "role": "Boss", "age": "40s"}, ...]
Include ALL indices 0 to """ + str(len(segments)-1) + """. gender must be "male" or "female". age should be like "20s", "30s", "40s", "50s", "60s" etc. role MUST be in English."""
                )
                detect_chat.with_model("openai", "gpt-5.2")
                
                # Send full dialogue with line numbers
                dialogue_lines = []
                for i, s in enumerate(segments):
                    dialogue_lines.append(f"Line {i}: \"{s['original']}\"")
                all_text = "\n".join(dialogue_lines)
                
                try:
                    result_text = await detect_chat.send_message(UserMessage(text=f"Identify speaker and gender for each line:\n\n{all_text}"))
                    logger.info(f"GPT detection result: {result_text[:500]}")
                    
                    if "[" in result_text:
                        start_idx = result_text.index("[")
                        end_idx = result_text.rindex("]") + 1
                        detections = json.loads(result_text[start_idx:end_idx])
                        
                        for d in detections:
                            idx = d.get("idx", -1)
                            if 0 <= idx < len(segments):
                                gender = d.get("gender", "female")
                                speaker = d.get("speaker", "SPEAKER_00")
                                role = d.get("role", "")
                                age = d.get("age", "")
                                segments[idx]["gender"] = gender
                                segments[idx]["speaker"] = speaker
                                segments[idx]["voice"] = "dara" if gender == "male" else "sophea"
                                if role:
                                    segments[idx]["role"] = role
                                if age:
                                    segments[idx]["age"] = age
                        
                        # Verify: count unique speakers detected
                        unique_speakers = set(s["speaker"] for s in segments)
                        logger.info(f"Detected {len(unique_speakers)} unique speakers: {unique_speakers}")
                        
                except Exception as e:
                    logger.warning(f"Speaker detection failed, using fallback: {e}")
                    # Fallback: try basic alternating if GPT fails
                    for i, seg in enumerate(segments):
                        segments[i]["speaker"] = f"SPEAKER_{str(i % 2).zfill(2)}"
                        segments[i]["gender"] = "female" if i % 2 == 0 else "male"
                        segments[i]["voice"] = "sophea" if i % 2 == 0 else "dara"

            # Build actors from unique speakers with speaking time ranges
            speaker_info = {}
            speaker_roles = {}
            speaker_ages = {}
            for seg in segments:
                spk = seg.get("speaker", "SPEAKER_00")
                if spk not in speaker_info:
                    speaker_info[spk] = {
                        "gender": seg.get("gender", "female"),
                        "first_start": seg.get("start", 0),
                        "last_end": seg.get("end", 0),
                        "total_time": 0,
                        "line_count": 0
                    }
                if spk not in speaker_roles and seg.get("role"):
                    speaker_roles[spk] = seg["role"]
                if spk not in speaker_ages and seg.get("age"):
                    speaker_ages[spk] = seg["age"]
                info = speaker_info[spk]
                info["last_end"] = max(info["last_end"], seg.get("end", 0))
                info["first_start"] = min(info["first_start"], seg.get("start", 0))
                info["total_time"] += (seg.get("end", 0) - seg.get("start", 0))
                info["line_count"] += 1

            actors = []
            for spk, info in speaker_info.items():
                role = speaker_roles.get(spk, "")
                age = speaker_ages.get(spk, "")
                gender_tag = "Boy" if info["gender"] == "male" else "Girl"
                # Build label: Role (Gender, Age)
                if role and age:
                    label = f"{role} ({gender_tag}, ~{age})"
                elif role:
                    label = f"{role} ({gender_tag})"
                elif age:
                    label = f"{gender_tag} (~{age})"
                else:
                    label = gender_tag
                
                # Auto-set pitch from detected age
                auto_pitch = 0
                if age:
                    try:
                        age_num = int(''.join(c for c in age if c.isdigit()) or '30')
                        auto_pitch = max(-6, min(6, round((30 - age_num) / 5)))
                    except:
                        auto_pitch = 0
                
                actors.append({
                    "id": spk,
                    "label": label,
                    "gender": info["gender"],
                    "role": role,
                    "age": age,
                    "pitch": auto_pitch,
                    "voice": "dara" if info["gender"] == "male" else "sophea",
                    "custom_voice": None,
                    "total_speaking_time": round(info["total_time"], 1),
                    "line_count": info["line_count"],
                    "first_start": round(info["first_start"], 1),
                    "last_end": round(info["last_end"], 1)
                })

            await db.projects.update_one(
                {"project_id": project_id},
                {"$set": {
                    "segments": segments, "actors": actors,
                    "detected_language": detected_lang,
                    "status": "transcribed", "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            return await db.projects.find_one({"project_id": project_id}, {"_id": 0})

    except Exception as e:
        logger.error(f"Transcription error: {str(e)}")
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": "error", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise HTTPException(status_code=500, detail=str(e))

# Translate segments
@api_router.post("/projects/{project_id}/translate-segments")
async def translate_segments(project_id: str, authorization: str = Header(None)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    segments = project.get("segments", [])
    if not segments:
        raise HTTPException(status_code=400, detail="No segments to translate")
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"status": "translating", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    try:
        detected_lang = project.get("detected_language", "zh")
        source_lang_name = LANGUAGE_NAMES.get(detected_lang, detected_lang)
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"translate_seg_{project_id}_{uuid.uuid4().hex[:6]}",
            system_message=f"""You are a {source_lang_name} to Khmer translator. Translate each numbered {source_lang_name} line to Khmer.
Return translations in exact same format: number followed by Khmer translation.
Only output translations, nothing else."""
        )
        chat.with_model("openai", "gpt-5.2")
        input_text = "\n".join([f"{i}: {s['original']}" for i, s in enumerate(segments)])
        translations = await chat.send_message(UserMessage(text=input_text))
        lines = translations.strip().split("\n")
        for line in lines:
            if ":" in line:
                try:
                    idx_str, trans = line.split(":", 1)
                    idx = int(idx_str.strip())
                    if idx < len(segments):
                        segments[idx]["translated"] = trans.strip()
                except (ValueError, IndexError):
                    pass
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"segments": segments, "status": "translated", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": "error", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise HTTPException(status_code=500, detail=str(e))

# Preview single line TTS
class PreviewRequest(BaseModel):
    text: str
    gender: str = "female"
    speed: int = 2
    pitch: int = 0

@api_router.post("/projects/{project_id}/preview-tts")
async def preview_tts(project_id: str, req: PreviewRequest, authorization: str = Header(None)):
    import edge_tts
    user = await get_current_user(authorization)
    
    voice = "km-KH-PisethNeural" if req.gender == "male" else "km-KH-SreymomNeural"
    rate = f"+{req.speed}%" if req.speed >= 0 else f"{req.speed}%"
    
    tts_path = os.path.join(tempfile.gettempdir(), f"preview_{uuid.uuid4().hex}.mp3")
    pitched_path = os.path.join(tempfile.gettempdir(), f"preview_pitched_{uuid.uuid4().hex}.mp3")
    try:
        communicate = edge_tts.Communicate(req.text, voice=voice, rate=rate)
        await communicate.save(tts_path)
        current_path = tts_path
        if req.pitch != 0:
            adjust_pitch(tts_path, pitched_path, req.pitch)
            current_path = pitched_path
        with open(current_path, "rb") as f:
            audio_data = f.read()
        return Response(content=audio_data, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for p in [tts_path, pitched_path]:
            if os.path.exists(p):
                os.unlink(p)

# Generate timestamp-aligned audio
@api_router.post("/projects/{project_id}/generate-audio-segments")
async def generate_audio_segments(project_id: str, speed: int = Query(2), authorization: str = Header(None)):
    import requests as req
    import time
    import io
    from pydub import AudioSegment

    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    segments = project.get("segments", [])
    if not segments:
        raise HTTPException(status_code=400, detail="No segments")
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"status": "generating_audio", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    try:
        # Gemini TTS voice mapping (male/female Khmer voices)
        voice_map = {
            "sophea": "Puck", "chanthy": "Kore", "bopha": "Leda", "srey": "Aoede",
            "dara": "Charon", "virak": "Orus", "sokha": "Fenrir", "pich": "Pegasus"
        }

        GOOGLE_TTS_KEY = os.environ.get('GOOGLE_TTS_KEY', '')
        TTS_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent"

        actors = project.get("actors", [])
        actor_voice_map = {a["id"]: a["custom_voice"] for a in actors if a.get("custom_voice")}
        actor_ai_voice_map = {a["id"]: a["voice"] for a in actors if a.get("voice")}

        # Get original media duration for timeline alignment
        total_duration_ms = 0
        try:
            file_data, _ = get_object(project["original_file_path"])
            with tempfile.NamedTemporaryFile(suffix=f".{project['original_filename'].split('.')[-1]}", delete=False) as tmp:
                tmp.write(file_data)
                tmp_path = tmp.name
            total_duration_ms = int(get_media_duration(tmp_path) * 1000)
            os.unlink(tmp_path)
        except Exception as e:
            logger.warning(f"Could not get media duration: {e}")

        has_timestamps = any(seg.get("start", 0) > 0 or seg.get("end", 0) > 0 for seg in segments)
        if not total_duration_ms and has_timestamps:
            last_end = max(seg.get("end", 0) for seg in segments)
            total_duration_ms = int((last_end + 2) * 1000)

        segment_audio_pairs = []
        
        # Separate custom audio segments and TTS segments
        custom_pairs = []
        tts_segments = []
        
        for seg in segments:
            if not seg.get("translated") and not seg.get("custom_audio"):
                continue
            custom_audio_path = seg.get("custom_audio") or actor_voice_map.get(seg.get("speaker", ""))
            if custom_audio_path:
                try:
                    audio_data, _ = get_object(custom_audio_path)
                    ext = custom_audio_path.split(".")[-1].lower() if "." in custom_audio_path else "wav"
                    audio_seg = AudioSegment.from_file(io.BytesIO(audio_data), format=ext)
                    custom_pairs.append((seg, audio_seg))
                    continue
                except Exception as e:
                    logger.warning(f"Custom audio load failed: {e}, falling back to TTS")
            if not seg.get("translated"):
                continue
            tts_segments.append(seg)

        # Parallel TTS generation - process 5 at a time
        import edge_tts
        BATCH_SIZE = 5
        
        async def generate_single_tts(seg):
            speaker = seg.get("speaker", "")
            seg_gender = seg.get("gender", "female")
            actor_pitch = 0
            for a in actors:
                if a["id"] == speaker:
                    seg_gender = a.get("gender", seg_gender)
                    actor_pitch = a.get("pitch", 0)
                    break
            edge_voice = "km-KH-PisethNeural" if seg_gender == "male" else "km-KH-SreymomNeural"
            tts_path = os.path.join(tempfile.gettempdir(), f"tts_{uuid.uuid4().hex}.mp3")
            pitched_path = os.path.join(tempfile.gettempdir(), f"tts_pitched_{uuid.uuid4().hex}.mp3")
            try:
                communicate = edge_tts.Communicate(seg["translated"], voice=edge_voice, rate=f"+{speed}%" if speed >= 0 else f"{speed}%")
                await communicate.save(tts_path)
                current_path = tts_path
                if actor_pitch != 0:
                    adjust_pitch(tts_path, pitched_path, actor_pitch)
                    current_path = pitched_path
                audio_seg = AudioSegment.from_file(current_path)
                for p in [tts_path, pitched_path]:
                    if os.path.exists(p):
                        os.unlink(p)
                return (seg, audio_seg)
            except Exception as e:
                logger.warning(f"Edge TTS failed for segment: {e}")
                for p in [tts_path, pitched_path]:
                    if os.path.exists(p):
                        try: os.unlink(p)
                        except: pass
                return None

        tts_pairs = []
        for i in range(0, len(tts_segments), BATCH_SIZE):
            batch = tts_segments[i:i + BATCH_SIZE]
            results = await asyncio.gather(*[generate_single_tts(seg) for seg in batch])
            tts_pairs.extend([r for r in results if r is not None])
            logger.info(f"TTS batch {i // BATCH_SIZE + 1}: {len([r for r in results if r])} generated")

        # Combine custom + TTS, sort by segment order
        all_pairs = custom_pairs + tts_pairs
        seg_order = {id(seg): idx for idx, seg in enumerate(segments)}
        segment_audio_pairs = sorted(all_pairs, key=lambda p: p[0].get("id", 0))

        if not segment_audio_pairs:
            raise Exception("No audio generated")

        # Timeline-aligned mixing
        if has_timestamps and total_duration_ms > 0:
            combined = AudioSegment.silent(duration=total_duration_ms)
            for seg, audio in segment_audio_pairs:
                start_ms = int(seg.get("start", 0) * 1000)
                seg_duration_ms = int((seg.get("end", 0) - seg.get("start", 0)) * 1000)
                
                # Speed up audio if it's longer than the segment slot (with 20% tolerance)
                if seg_duration_ms > 0 and len(audio) > seg_duration_ms * 1.2:
                    speed_factor = len(audio) / seg_duration_ms
                    if speed_factor <= 2.0:
                        audio = audio.speedup(playback_speed=min(speed_factor, 1.8))
                
                combined = combined.overlay(audio, position=start_ms)
        else:
            # Simple concatenation fallback
            combined = segment_audio_pairs[0][1]
            for _, audio in segment_audio_pairs[1:]:
                combined += audio

        output = io.BytesIO()
        combined.export(output, format="wav")
        audio_bytes = output.getvalue()

        path = f"{APP_NAME}/audio/{user.user_id}/{project_id}/dubbed_{uuid.uuid4().hex}.wav"
        result = put_object(path, audio_bytes, "audio/wav")
        
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"dubbed_audio_path": result["path"], "status": "audio_ready", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return await db.projects.find_one({"project_id": project_id}, {"_id": 0})

    except Exception as e:
        logger.error(f"Audio generation error: {str(e)}")
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": "error", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise HTTPException(status_code=500, detail=str(e))

# Generate video with optional burned-in subtitles
@api_router.post("/projects/{project_id}/generate-video")
async def generate_video(project_id: str, burn_subtitles: bool = Query(False), authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("file_type") != "video":
        raise HTTPException(status_code=400, detail="Original file is not a video")
    if not project.get("dubbed_audio_path"):
        raise HTTPException(status_code=400, detail="No dubbed audio. Generate audio first.")

    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"status": "generating_video", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    try:
        video_data, _ = get_object(project["original_file_path"])
        audio_data, _ = get_object(project["dubbed_audio_path"])

        with tempfile.TemporaryDirectory() as temp_dir:
            ext = project["original_filename"].split(".")[-1] if "." in project["original_filename"] else "mp4"
            video_path = os.path.join(temp_dir, f"video.{ext}")
            audio_path = os.path.join(temp_dir, "dubbed_audio.wav")
            output_path = os.path.join(temp_dir, "output.mp4")

            with open(video_path, "wb") as f:
                f.write(video_data)
            with open(audio_path, "wb") as f:
                f.write(audio_data)

            segments = project.get("segments", [])
            if burn_subtitles and segments:
                srt_content = generate_srt(segments)
                srt_path = os.path.join(temp_dir, "subtitles.srt")
                with open(srt_path, "w", encoding="utf-8") as f:
                    f.write(srt_content)
                burn_subtitles_into_video(video_path, srt_path, audio_path, output_path)
            else:
                merge_audio_with_video(video_path, audio_path, output_path)

            with open(output_path, "rb") as f:
                output_data = f.read()

            storage_path = f"{APP_NAME}/video/{user.user_id}/{project_id}/dubbed_{uuid.uuid4().hex}.mp4"
            result = put_object(storage_path, output_data, "video/mp4")

            await db.projects.update_one(
                {"project_id": project_id},
                {"$set": {"dubbed_video_path": result["path"], "status": "completed", "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            return await db.projects.find_one({"project_id": project_id}, {"_id": 0})

    except Exception as e:
        logger.error(f"Video generation error: {str(e)}")
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": "error", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise HTTPException(status_code=500, detail=str(e))

# File download
@api_router.get("/files/{path:path}")
async def download_file(path: str, authorization: str = Header(None), auth: str = Query(None)):
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    user = await get_current_user(auth_header)
    if user.user_id not in path:
        raise HTTPException(status_code=403, detail="Access denied")
    data, content_type = get_object(path)
    return Response(content=data, media_type=content_type)

# Quick translate
@api_router.post("/translate")
async def quick_translate(request: TranslateRequest, authorization: str = Header(None)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    user = await get_current_user(authorization)
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"quick_translate_{uuid.uuid4().hex[:8]}",
        system_message="You are a professional Chinese to Khmer translator. Only output the Khmer translation."
    )
    chat.with_model("openai", "gpt-5.2")
    translated = await chat.send_message(UserMessage(text=request.chinese_text))
    return {"original": request.chinese_text, "translated": translated}

# Download SRT subtitle file
@api_router.get("/projects/{project_id}/download-srt")
async def download_srt(project_id: str, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    segments = project.get("segments", [])
    if not segments:
        raise HTTPException(status_code=400, detail="No segments available")
    srt_content = generate_srt(segments)
    filename = f"{project.get('title', 'subtitles')}_khmer.srt"
    return Response(
        content=srt_content.encode("utf-8"),
        media_type="application/x-subrip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

# Download dubbed audio as MP3
@api_router.get("/projects/{project_id}/download-mp3")
async def download_mp3(project_id: str, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.get("dubbed_audio_path"):
        raise HTTPException(status_code=400, detail="No dubbed audio available")
    audio_data, _ = get_object(project["dubbed_audio_path"])
    # Convert WAV to MP3 using ffmpeg
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_tmp:
        wav_tmp.write(audio_data)
        wav_path = wav_tmp.name
    mp3_path = wav_path.replace(".wav", ".mp3")
    try:
        cmd = ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-b:a", "192k", mp3_path]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"FFmpeg error: {result.stderr}")
        with open(mp3_path, "rb") as f:
            mp3_data = f.read()
        filename = f"{project.get('title', 'dubbed')}_khmer.mp3"
        return Response(
            content=mp3_data,
            media_type="audio/mpeg",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    finally:
        for p in [wav_path, mp3_path]:
            if os.path.exists(p):
                os.unlink(p)

# Generate share link
@api_router.post("/projects/{project_id}/share")
async def create_share_link(project_id: str, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    share_token = project.get("share_token")
    if not share_token:
        share_token = f"share_{uuid.uuid4().hex[:16]}"
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"share_token": share_token, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    return {"share_token": share_token}

# Remove share link
@api_router.delete("/projects/{project_id}/share")
async def remove_share_link(project_id: str, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"share_token": None, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True}

# Public shared project view (no auth needed)
@api_router.get("/shared/{share_token}")
async def get_shared_project(share_token: str):
    project = await db.projects.find_one({"share_token": share_token}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Shared project not found")
    # Return only safe public info
    return {
        "title": project.get("title"),
        "status": project.get("status"),
        "detected_language": project.get("detected_language"),
        "file_type": project.get("file_type"),
        "segments": project.get("segments", []),
        "actors": project.get("actors", []),
        "has_video": bool(project.get("dubbed_video_path")),
        "has_audio": bool(project.get("dubbed_audio_path")),
        "created_at": project.get("created_at"),
    }

# Public file download (no auth, uses share token)
@api_router.get("/shared/{share_token}/video")
async def get_shared_video(share_token: str):
    project = await db.projects.find_one({"share_token": share_token})
    if not project or not project.get("dubbed_video_path"):
        raise HTTPException(status_code=404, detail="Not found")
    data, content_type = get_object(project["dubbed_video_path"])
    return Response(content=data, media_type=content_type)

@api_router.get("/shared/{share_token}/audio")
async def get_shared_audio(share_token: str):
    project = await db.projects.find_one({"share_token": share_token})
    if not project or not project.get("dubbed_audio_path"):
        raise HTTPException(status_code=404, detail="Not found")
    data, content_type = get_object(project["dubbed_audio_path"])
    return Response(content=data, media_type=content_type)

@api_router.get("/shared/{share_token}/srt")
async def get_shared_srt(share_token: str):
    project = await db.projects.find_one({"share_token": share_token})
    if not project:
        raise HTTPException(status_code=404, detail="Not found")
    segments = project.get("segments", [])
    if not segments:
        raise HTTPException(status_code=400, detail="No subtitles")
    srt_content = generate_srt(segments)
    return Response(
        content=srt_content.encode("utf-8"),
        media_type="application/x-subrip",
        headers={"Content-Disposition": f'attachment; filename="{project.get("title", "subtitles")}_khmer.srt"'}
    )

# Queue status endpoint
@api_router.get("/projects/{project_id}/queue-status")
async def get_queue_status(project_id: str, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    qs = queue_status.get(project_id, {"position": 0, "status": project.get("status", "created")})
    return {
        "project_id": project_id,
        "status": project.get("status", "created"),
        "queue_position": qs.get("position", 0),
        "queue_status": qs.get("status", "idle"),
    }

# Auto-process: transcribe + translate + generate audio in one call
@api_router.post("/projects/{project_id}/auto-process")
async def auto_process(project_id: str, speed: int = Query(2), authorization: str = Header(None)):
    from emergentintegrations.llm.openai import OpenAISpeechToText
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.get("original_file_path"):
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    queue_status[project_id] = {"position": 0, "status": "processing"}
    
    try:
        # Step 1: Transcribe (if not done)
        if project.get("status") in ["created", "uploaded"]:
            await db.projects.update_one(
                {"project_id": project_id},
                {"$set": {"status": "transcribing", "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            # Call transcribe endpoint logic internally
            result = await transcribe_segments(project_id, authorization=f"Bearer {authorization.split('Bearer ')[-1] if 'Bearer ' in (authorization or '') else authorization}")
            project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
        
        # Step 2: Translate (if not done)
        if project.get("status") == "transcribed":
            result = await translate_segments(project_id, authorization=f"Bearer {authorization.split('Bearer ')[-1] if 'Bearer ' in (authorization or '') else authorization}")
            project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
        
        # Step 3: Generate audio (if not done)
        if project.get("status") == "translated":
            result = await generate_audio_segments(project_id, speed=speed, authorization=f"Bearer {authorization.split('Bearer ')[-1] if 'Bearer ' in (authorization or '') else authorization}")
            project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
        
        queue_status[project_id] = {"position": 0, "status": "done"}
        return project
        
    except Exception as e:
        queue_status[project_id] = {"position": 0, "status": "error"}
        logger.error(f"Auto-process error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup():
    logger.info("Storage initialized (local)")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
