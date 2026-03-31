from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Response, Query, BackgroundTasks, Form
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import requests
import subprocess
import tempfile
import shutil

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Emergent LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

# ElevenLabs API Key
ELEVENLABS_API_KEY = os.environ.get('ELEVENLABS_API_KEY')

# Google Cloud API Key for Khmer TTS
GOOGLE_CLOUD_API_KEY = os.environ.get('GOOGLE_CLOUD_API_KEY')

# CAMB.AI API Key for real Khmer TTS
CAMB_API_KEY = os.environ.get('CAMB_API_KEY')

# Object Storage with local fallback
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "khmer-dubbing"
storage_key = None
USE_LOCAL_STORAGE = True  # Fallback to local storage

# Local storage directory
LOCAL_STORAGE_DIR = Path("/app/uploads")
LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

def init_storage():
    """Initialize storage - call once at startup"""
    global storage_key, USE_LOCAL_STORAGE
    if USE_LOCAL_STORAGE:
        return "local"
    if storage_key:
        return storage_key
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        USE_LOCAL_STORAGE = False
        return storage_key
    except Exception as e:
        logger.warning(f"Object storage unavailable, using local storage: {e}")
        USE_LOCAL_STORAGE = True
        return "local"

def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload file to storage (local or remote)"""
    if USE_LOCAL_STORAGE:
        # Use local storage
        file_path = LOCAL_STORAGE_DIR / path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(data)
        return {"path": path, "size": len(data)}
    
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=300
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str) -> tuple:
    """Download file from storage (local or remote)"""
    if USE_LOCAL_STORAGE:
        file_path = LOCAL_STORAGE_DIR / path
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        with open(file_path, "rb") as f:
            data = f.read()
        # Guess content type from extension
        ext = path.split(".")[-1].lower() if "." in path else ""
        content_types = {
            "mp4": "video/mp4", "mov": "video/quicktime", "avi": "video/x-msvideo",
            "mp3": "audio/mpeg", "wav": "audio/wav", "m4a": "audio/mp4",
            "webm": "video/webm", "mkv": "video/x-matroska"
        }
        return data, content_types.get(ext, "application/octet-stream")
    
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=120
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: str

class DubbingProject(BaseModel):
    model_config = ConfigDict(extra="ignore")
    project_id: str
    user_id: str
    title: str
    file_type: str = "text"  # text, audio, video
    original_file_path: Optional[str] = None
    original_filename: Optional[str] = None
    extracted_audio_path: Optional[str] = None
    original_text: Optional[str] = None
    translated_text: Optional[str] = None
    dubbed_audio_path: Optional[str] = None
    dubbed_video_path: Optional[str] = None
    status: str = "created"
    voice: str = "alloy"
    created_at: str
    updated_at: str

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

# Auth helper
async def get_current_user(authorization: str = Header(None)) -> User:
    """Get current user from session token"""
    token = None
    if authorization:
        if authorization.startswith("Bearer "):
            token = authorization.replace("Bearer ", "")
        else:
            token = authorization
    
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

# Helper functions
def extract_audio_from_video(video_path: str, audio_path: str):
    """Extract audio from video using ffmpeg"""
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-acodec", "libmp3lame", "-ar", "44100", "-ac", "2", "-b:a", "192k",
        audio_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"FFmpeg error: {result.stderr}")

def merge_audio_with_video(video_path: str, audio_path: str, output_path: str):
    """Replace video audio with new dubbed audio"""
    cmd = [
        "ffmpeg", "-y", "-i", video_path, "-i", audio_path,
        "-c:v", "copy", "-map", "0:v:0", "-map", "1:a:0",
        "-shortest", output_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"FFmpeg error: {result.stderr}")

def get_file_type(filename: str) -> str:
    """Determine file type from extension"""
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    video_exts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv']
    audio_exts = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']
    if ext in video_exts:
        return 'video'
    elif ext in audio_exts:
        return 'audio'
    return 'unknown'

# Routes
@api_router.get("/")
async def root():
    return {"message": "Khmer Dubbing API"}

# Auth endpoints
@api_router.post("/auth/session")
async def create_session(session_id: str = Header(..., alias="X-Session-ID")):
    """Exchange session_id for session_token after Google auth"""
    async with httpx.AsyncClient() as client_http:
        resp = await client_http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session ID")
        
        data = resp.json()
    
    existing_user = await db.users.find_one({"email": data["email"]}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data["name"], "picture": data.get("picture")}}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": data["email"],
            "name": data["name"],
            "picture": data.get("picture"),
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    session_token = data.get("session_token") or f"sess_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    response = Response(content='{"success": true}', media_type="application/json")
    response.set_cookie(
        key="session_token",
        value=session_token,
        path="/",
        secure=True,
        httponly=True,
        samesite="none",
        max_age=7 * 24 * 60 * 60
    )
    return {"user": user, "session_token": session_token}

@api_router.get("/auth/me")
async def get_me(authorization: str = Header(None)):
    """Get current user"""
    user = await get_current_user(authorization)
    return user.model_dump()

@api_router.post("/auth/logout")
async def logout(authorization: str = Header(None)):
    """Logout user"""
    token = None
    if authorization:
        if authorization.startswith("Bearer "):
            token = authorization.replace("Bearer ", "")
        else:
            token = authorization
    
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    
    response = Response(content='{"success": true}', media_type="application/json")
    response.delete_cookie(key="session_token", path="/")
    return {"success": True}

# Project endpoints
@api_router.post("/projects")
async def create_project(project: ProjectCreate, authorization: str = Header(None)):
    """Create a new dubbing project"""
    user = await get_current_user(authorization)
    
    project_id = f"proj_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    project_doc = {
        "project_id": project_id,
        "user_id": user.user_id,
        "title": project.title,
        "file_type": "text",
        "original_file_path": None,
        "original_filename": None,
        "extracted_audio_path": None,
        "original_text": None,
        "translated_text": None,
        "dubbed_audio_path": None,
        "dubbed_video_path": None,
        "segments": [],
        "status": "created",
        "voice": "sophea",
        "female_voice": "sophea",
        "male_voice": "dara",
        "created_at": now,
        "updated_at": now
    }
    
    await db.projects.insert_one(project_doc)
    
    return await db.projects.find_one({"project_id": project_id}, {"_id": 0})

@api_router.get("/projects")
async def list_projects(authorization: str = Header(None)):
    """List all projects for current user"""
    user = await get_current_user(authorization)
    projects = await db.projects.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return projects

@api_router.get("/projects/{project_id}")
async def get_project(project_id: str, authorization: str = Header(None)):
    """Get a single project"""
    user = await get_current_user(authorization)
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@api_router.patch("/projects/{project_id}")
async def update_project(project_id: str, update: ProjectUpdate, authorization: str = Header(None)):
    """Update a project"""
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
    """Delete a project"""
    user = await get_current_user(authorization)
    
    result = await db.projects.delete_one({"project_id": project_id, "user_id": user.user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True}

# File upload
@api_router.post("/projects/{project_id}/upload")
async def upload_file(project_id: str, file: UploadFile = File(...), authorization: str = Header(None)):
    """Upload audio/video file for a project"""
    user = await get_current_user(authorization)
    
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Determine file type
    file_type = get_file_type(file.filename)
    if file_type == 'unknown':
        raise HTTPException(status_code=400, detail="Unsupported file type. Please upload video (mp4, mov, etc.) or audio (mp3, wav, etc.)")
    
    # Read file
    data = await file.read()
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{user.user_id}/{project_id}/{uuid.uuid4().hex}.{ext}"
    
    # Upload to storage
    result = put_object(path, data, file.content_type or "application/octet-stream")
    
    # Update project
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "original_file_path": result["path"],
            "original_filename": file.filename,
            "file_type": file_type,
            "status": "uploaded",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return await db.projects.find_one({"project_id": project_id}, {"_id": 0})

# Upload custom voice audio for a segment
@api_router.post("/projects/{project_id}/upload-segment-audio")
async def upload_segment_audio(
    project_id: str, 
    file: UploadFile = File(...), 
    segment_id: int = 0,
    authorization: str = Header(None)
):
    """Upload custom voice audio for a specific segment"""
    user = await get_current_user(authorization)
    
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Read file
    data = await file.read()
    ext = file.filename.split(".")[-1] if "." in file.filename else "wav"
    path = f"{APP_NAME}/custom_audio/{user.user_id}/{project_id}/segment_{segment_id}_{uuid.uuid4().hex}.{ext}"
    
    # Upload to storage
    result = put_object(path, data, file.content_type or "audio/wav")
    
    # Update segment with custom audio path
    segments = project.get("segments", [])
    if segment_id < len(segments):
        segments[segment_id]["custom_audio"] = result["path"]
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"segments": segments, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    return {"audio_path": result["path"], "segment_id": segment_id}

# Upload custom voice for an actor
@api_router.post("/projects/{project_id}/upload-actor-voice")
async def upload_actor_voice(
    project_id: str,
    file: UploadFile = File(...),
    actor_id: str = Form(""),
    authorization: str = Header(None)
):
    """Upload custom voice audio for a specific actor (applies to all their segments)"""
    user = await get_current_user(authorization)
    
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    data = await file.read()
    ext = file.filename.split(".")[-1] if "." in file.filename else "wav"
    path = f"{APP_NAME}/custom_audio/{user.user_id}/{project_id}/actor_{actor_id}_{uuid.uuid4().hex}.{ext}"
    
    result = put_object(path, data, file.content_type or "audio/wav")
    
    # Update actor with custom voice path
    actors = project.get("actors", [])
    for actor in actors:
        if actor["id"] == actor_id:
            actor["custom_voice"] = result["path"]
            break
    
    # Also update all segments belonging to this actor
    segments = project.get("segments", [])
    for seg in segments:
        if seg.get("speaker") == actor_id:
            seg["custom_audio"] = result["path"]
    
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "actors": actors,
            "segments": segments,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"voice_path": result["path"], "actor_id": actor_id}

# Transcribe audio/video
@api_router.post("/projects/{project_id}/transcribe")
async def transcribe_project(project_id: str, authorization: str = Header(None)):
    """Transcribe Chinese audio from uploaded file using Whisper with gender detection"""
    from emergentintegrations.llm.openai import OpenAISpeechToText
    
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
        # Download file from storage
        file_data, content_type = get_object(project["original_file_path"])
        
        # Create temp directory
        with tempfile.TemporaryDirectory() as temp_dir:
            ext = project["original_filename"].split(".")[-1] if "." in project["original_filename"] else "mp4"
            input_path = os.path.join(temp_dir, f"input.{ext}")
            audio_path = os.path.join(temp_dir, "audio.wav")
            
            # Write input file
            with open(input_path, "wb") as f:
                f.write(file_data)
            
            # Extract audio if video (use wav for gender detection)
            if project.get("file_type") == "video":
                cmd = ["ffmpeg", "-y", "-i", input_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audio_path]
                subprocess.run(cmd, capture_output=True)
                
                # Upload extracted audio to storage
                with open(audio_path, "rb") as f:
                    audio_data = f.read()
                audio_storage_path = f"{APP_NAME}/audio/{user.user_id}/{project_id}/extracted_{uuid.uuid4().hex}.wav"
                put_object(audio_storage_path, audio_data, "audio/wav")
                
                await db.projects.update_one(
                    {"project_id": project_id},
                    {"$set": {"extracted_audio_path": audio_storage_path}}
                )
            else:
                # Convert to wav for processing
                cmd = ["ffmpeg", "-y", "-i", input_path, "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audio_path]
                subprocess.run(cmd, capture_output=True)
            
            # Gender detection using inaSpeechSegmenter
            gender_segments = []
            try:
                from inaSpeechSegmenter import Segmenter
                seg = Segmenter()
                segmentation = seg(audio_path)
                
                # segmentation format: [(label, start, end), ...]
                # labels: 'female', 'male', 'noEnergy', 'noise', 'music'
                for label, start, end in segmentation:
                    if label in ['female', 'male']:
                        gender_segments.append({
                            'gender': 'F' if label == 'female' else 'M',
                            'start': start,
                            'end': end
                        })
                logger.info(f"Gender segments detected: {gender_segments}")
            except Exception as e:
                logger.warning(f"Gender detection failed: {e}")
            
            # Transcribe using Whisper with timestamps
            stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
            
            with open(audio_path, "rb") as audio_file:
                response = await stt.transcribe(
                    file=audio_file,
                    model="whisper-1",
                    language="zh",
                    response_format="verbose_json"
                )
            
            # Process transcription with gender markers
            if gender_segments and hasattr(response, 'segments'):
                # Match transcription segments with gender
                marked_text = ""
                current_gender = None
                
                for seg in response.segments:
                    seg_start = seg.get('start', 0)
                    seg_text = seg.get('text', '')
                    
                    # Find gender for this segment
                    seg_gender = None
                    for gs in gender_segments:
                        if gs['start'] <= seg_start < gs['end']:
                            seg_gender = gs['gender']
                            break
                    
                    # Add gender marker if changed
                    if seg_gender and seg_gender != current_gender:
                        marked_text += f"[{seg_gender}]"
                        current_gender = seg_gender
                    
                    marked_text += seg_text
                
                transcribed_text = marked_text if marked_text else response.text
            else:
                transcribed_text = response if isinstance(response, str) else response.text
            
            await db.projects.update_one(
                {"project_id": project_id},
                {"$set": {
                    "original_text": transcribed_text,
                    "status": "transcribed",
                    "updated_at": datetime.now(timezone.utc).isoformat()
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

# Transcribe with segments (timestamp-based)
@api_router.post("/projects/{project_id}/transcribe-segments")
async def transcribe_segments(project_id: str, authorization: str = Header(None)):
    """Transcribe audio with timestamps and speaker detection"""
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
        # Download file
        file_data, _ = get_object(project["original_file_path"])
        
        with tempfile.TemporaryDirectory() as temp_dir:
            ext = project["original_filename"].split(".")[-1] if "." in project["original_filename"] else "mp4"
            input_path = os.path.join(temp_dir, f"input.{ext}")
            audio_path = os.path.join(temp_dir, "audio.wav")
            
            with open(input_path, "wb") as f:
                f.write(file_data)
            
            # Extract audio
            cmd = ["ffmpeg", "-y", "-i", input_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audio_path]
            subprocess.run(cmd, capture_output=True)
            
            # Transcribe with Whisper (verbose_json for timestamps)
            stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
            
            with open(audio_path, "rb") as audio_file:
                response = await stt.transcribe(
                    file=audio_file,
                    model="whisper-1",
                    language="zh",
                    response_format="verbose_json"
                )
            
            # Parse segments
            raw_segments = response.segments if hasattr(response, 'segments') else []
            
            segments = []
            for i, seg in enumerate(raw_segments):
                segments.append({
                    "id": i,
                    "start": seg.get('start', 0),
                    "end": seg.get('end', 0),
                    "original": seg.get('text', '').strip(),
                    "translated": "",
                    "speaker": f"SPEAKER_{str(i % 2).zfill(2)}",
                    "gender": "female" if i % 2 == 0 else "male",
                    "voice": "sophea" if i % 2 == 0 else "dara"
                })
            
            # Use AI to detect gender from context
            if segments:
                detect_chat = LlmChat(
                    api_key=EMERGENT_LLM_KEY,
                    session_id=f"detect_{project_id}",
                    system_message="""Analyze the Chinese text segments and detect speaker gender.
For each segment, determine if speaker is male or female based on:
- Context clues (他/她, 男/女, names)
- Dialogue patterns
- Speaking style

Return a JSON array with segment index and gender:
[{"idx": 0, "gender": "female"}, {"idx": 1, "gender": "male"}, ...]"""
                )
                detect_chat.with_model("openai", "gpt-5.2")
                
                all_text = "\n".join([f"{i}: {s['original']}" for i, s in enumerate(segments)])
                try:
                    gender_result = await detect_chat.send_message(UserMessage(text=all_text))
                    import json
                    # Try to parse gender detection
                    if "[" in gender_result:
                        start = gender_result.index("[")
                        end = gender_result.rindex("]") + 1
                        genders = json.loads(gender_result[start:end])
                        for g in genders:
                            idx = g.get("idx", 0)
                            if idx < len(segments):
                                segments[idx]["gender"] = g.get("gender", "female")
                                segments[idx]["voice"] = "dara" if g.get("gender") == "male" else "sophea"
                except Exception as e:
                    logger.warning(f"Gender detection failed: {e}")
            
            # Build actors list from unique speakers
            speaker_map = {}
            for seg in segments:
                spk = seg.get("speaker", "SPEAKER_00")
                if spk not in speaker_map:
                    speaker_map[spk] = seg.get("gender", "female")
            
            actors = []
            for spk, gender in speaker_map.items():
                actors.append({
                    "id": spk,
                    "label": spk.replace("SPEAKER_", "Actor ").replace("_", " "),
                    "gender": gender,
                    "voice": "dara" if gender == "male" else "sophea",
                    "custom_voice": None
                })
            
            await db.projects.update_one(
                {"project_id": project_id},
                {"$set": {
                    "segments": segments,
                    "actors": actors,
                    "status": "transcribed",
                    "updated_at": datetime.now(timezone.utc).isoformat()
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
    """Translate all segments to Khmer"""
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
        # Translate all segments at once for consistency
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"translate_seg_{project_id}",
            system_message="""You are a Chinese to Khmer translator. Translate each numbered Chinese line to Khmer.
Return translations in exact same format: number followed by Khmer translation.
Only output translations, nothing else."""
        )
        chat.with_model("openai", "gpt-5.2")
        
        # Build input text
        input_text = "\n".join([f"{i}: {s['original']}" for i, s in enumerate(segments)])
        translations = await chat.send_message(UserMessage(text=input_text))
        
        # Parse translations
        lines = translations.strip().split("\n")
        for line in lines:
            if ":" in line:
                try:
                    idx_str, trans = line.split(":", 1)
                    idx = int(idx_str.strip())
                    if idx < len(segments):
                        segments[idx]["translated"] = trans.strip()
                except:
                    pass
        
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {
                "segments": segments,
                "status": "translated",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return await db.projects.find_one({"project_id": project_id}, {"_id": 0})
        
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": "error", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise HTTPException(status_code=500, detail=str(e))

# Generate audio from segments
@api_router.post("/projects/{project_id}/generate-audio-segments")
async def generate_audio_segments(project_id: str, authorization: str = Header(None)):
    """Generate multi-voice audio from segments"""
    import requests
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
        headers = {
            "x-api-key": CAMB_API_KEY,
            "Content-Type": "application/json"
        }
        
        voice_gender = {
            "sophea": 2, "chanthy": 2, "bopha": 2, "srey": 2,
            "dara": 1, "virak": 1, "sokha": 1, "pich": 1
        }
        
        # Build actor voice map (actor_id -> custom_voice_path)
        actors = project.get("actors", [])
        actor_voice_map = {}
        actor_ai_voice_map = {}
        for actor in actors:
            if actor.get("custom_voice"):
                actor_voice_map[actor["id"]] = actor["custom_voice"]
            if actor.get("voice"):
                actor_ai_voice_map[actor["id"]] = actor["voice"]
        
        audio_parts = []
        
        for seg in segments:
            if not seg.get("translated") and not seg.get("custom_audio"):
                continue
            
            # Priority: segment custom_audio > actor custom_voice > AI TTS
            custom_audio_path = seg.get("custom_audio")
            if not custom_audio_path:
                speaker = seg.get("speaker", "")
                custom_audio_path = actor_voice_map.get(speaker)
            
            if custom_audio_path:
                # Use custom uploaded audio
                try:
                    custom_audio_data, _ = get_object(custom_audio_path)
                    ext = custom_audio_path.split(".")[-1].lower() if "." in custom_audio_path else "wav"
                    audio_segment = AudioSegment.from_file(io.BytesIO(custom_audio_data), format=ext)
                    audio_parts.append(audio_segment)
                    continue
                except Exception as e:
                    logger.warning(f"Failed to load custom audio: {e}, falling back to TTS")
            
            # Use AI TTS
            if not seg.get("translated"):
                continue
            
            # Use actor-level AI voice if set, otherwise segment voice
            speaker = seg.get("speaker", "")
            voice = actor_ai_voice_map.get(speaker, seg.get("voice", "sophea"))
            gender = voice_gender.get(voice, 2)
            
            # Generate TTS
            payload = {
                "text": seg["translated"],
                "voice_id": 147319,
                "language": 92,
                "gender": gender
            }
            
            response = requests.post(
                "https://client.camb.ai/apis/tts",
                json=payload,
                headers=headers,
                timeout=30
            )
            response.raise_for_status()
            task_id = response.json().get("task_id")
            
            # Poll for completion
            for _ in range(60):
                status_resp = requests.get(
                    f"https://client.camb.ai/apis/tts/{task_id}",
                    headers=headers,
                    timeout=30
                )
                status_data = status_resp.json()
                if status_data.get("status") == "SUCCESS":
                    run_id = status_data.get("run_id")
                    break
                elif status_data.get("status") == "FAILURE":
                    raise Exception(f"TTS failed")
                time.sleep(2)
            
            # Download audio
            audio_resp = requests.get(
                f"https://client.camb.ai/apis/tts-result/{run_id}",
                headers=headers,
                timeout=60
            )
            audio_segment = AudioSegment.from_file(io.BytesIO(audio_resp.content), format="flac")
            audio_parts.append(audio_segment)
        
        # Combine all audio
        if audio_parts:
            combined = audio_parts[0]
            for part in audio_parts[1:]:
                combined += part
            
            output = io.BytesIO()
            combined.export(output, format="wav")
            audio_bytes = output.getvalue()
        else:
            raise Exception("No audio generated")
        
        # Upload
        path = f"{APP_NAME}/audio/{user.user_id}/{project_id}/dubbed_{uuid.uuid4().hex}.wav"
        result = put_object(path, audio_bytes, "audio/wav")
        
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {
                "dubbed_audio_path": result["path"],
                "status": "audio_ready",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return await db.projects.find_one({"project_id": project_id}, {"_id": 0})
        
    except Exception as e:
        logger.error(f"Audio generation error: {str(e)}")
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": "error", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise HTTPException(status_code=500, detail=str(e))

# Translation
@api_router.post("/projects/{project_id}/translate")
async def translate_project(project_id: str, authorization: str = Header(None)):
    """Translate Chinese text to Khmer with auto speaker/gender detection"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    user = await get_current_user(authorization)
    
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.get("original_text"):
        raise HTTPException(status_code=400, detail="No text to translate")
    
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"status": "translating", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    try:
        original_text = project["original_text"]
        
        # First, detect speakers and add markers using AI
        detect_chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"detect_{project_id}",
            system_message="""You are a speaker detection expert. Analyze the Chinese text and identify different speakers.
Add [F] marker before female speaker parts and [M] marker before male speaker parts.

Rules:
1. Look for dialogue patterns like 女：, 男：, 她说, 他说, etc.
2. Look for names that indicate gender (小红=female, 小明=male)
3. Look for pronouns 她/他
4. If a conversation, alternate speakers get different markers
5. If only one speaker or unclear, use [F] for female-sounding or [M] for male-sounding based on context
6. ALWAYS add at least one [F] or [M] marker at the start

Output ONLY the text with [F] and [M] markers added, nothing else.

Example input: 女：你好。男：欢迎。
Example output: [F]你好。[M]欢迎。

Example input: 大家好，我是医生。
Example output: [M]大家好，我是医生。"""
        )
        detect_chat.with_model("openai", "gpt-5.2")
        
        marked_text = await detect_chat.send_message(UserMessage(text=original_text))
        
        # Ensure markers exist
        if "[F]" not in marked_text and "[M]" not in marked_text:
            marked_text = "[F]" + marked_text  # Default to female if no markers
        
        logger.info(f"Marked text: {marked_text}")
        
        # Now translate with marker preservation
        translate_chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"translate_{project_id}",
            system_message="""You are a professional Chinese to Khmer translator.
Translate the given Chinese text to Khmer accurately.
CRITICAL: Keep ALL [F] and [M] markers EXACTLY where they are - do not translate, remove, or move them.
[F] = female speaker, [M] = male speaker.
Output ONLY the Khmer translation with preserved markers."""
        )
        translate_chat.with_model("openai", "gpt-5.2")
        
        translated = await translate_chat.send_message(UserMessage(text=marked_text))
        
        # Verify markers are preserved
        if "[F]" not in translated and "[M]" not in translated:
            # Markers were lost, add them back based on original
            if "[F]" in marked_text:
                translated = "[F]" + translated
            elif "[M]" in marked_text:
                translated = "[M]" + translated
        
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {
                "original_text": marked_text,  # Save marked version
                "translated_text": translated,
                "status": "translated",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": "error", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise HTTPException(status_code=500, detail=str(e))

# Generate dubbed audio
@api_router.post("/projects/{project_id}/generate-audio")
async def generate_audio(project_id: str, authorization: str = Header(None)):
    """Generate Khmer dubbed audio using CAMB.AI with multi-speaker support"""
    import requests
    import time
    import io
    from pydub import AudioSegment
    
    user = await get_current_user(authorization)
    
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.get("translated_text"):
        raise HTTPException(status_code=400, detail="No translated text to generate audio from")
    
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"status": "generating_audio", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    try:
        # Voice gender mapping: 1=Male, 2=Female
        voice_gender = {
            "sophea": 2, "chanthy": 2, "bopha": 2, "srey": 2,
            "dara": 1, "virak": 1, "sokha": 1, "pich": 1
        }
        
        headers = {
            "x-api-key": CAMB_API_KEY,
            "Content-Type": "application/json"
        }
        
        translated_text = project["translated_text"]
        
        # Check if text has speaker markers [F] for female, [M] for male
        # Format: [F]សួស្តី[M]សូមស្វាគមន៍
        has_markers = "[F]" in translated_text or "[M]" in translated_text
        
        if has_markers:
            # Multi-speaker mode - split by markers and generate separate audio
            import re
            segments = re.split(r'(\[F\]|\[M\])', translated_text)
            
            audio_segments = []
            current_gender = 2  # Default female
            
            female_voice = project.get("female_voice", "sophea")
            male_voice = project.get("male_voice", "dara")
            
            for seg in segments:
                if seg == "[F]":
                    current_gender = voice_gender.get(female_voice, 2)
                    continue
                elif seg == "[M]":
                    current_gender = voice_gender.get(male_voice, 1)
                    continue
                elif seg.strip():
                    # Generate audio for this segment
                    payload = {
                        "text": seg.strip(),
                        "voice_id": 147319,
                        "language": 92,
                        "gender": current_gender
                    }
                    
                    response = requests.post(
                        "https://client.camb.ai/apis/tts",
                        json=payload,
                        headers=headers,
                        timeout=30
                    )
                    response.raise_for_status()
                    task_id = response.json().get("task_id")
                    
                    # Poll for completion
                    for _ in range(60):
                        status_resp = requests.get(
                            f"https://client.camb.ai/apis/tts/{task_id}",
                            headers=headers,
                            timeout=30
                        )
                        status_data = status_resp.json()
                        if status_data.get("status") == "SUCCESS":
                            run_id = status_data.get("run_id")
                            break
                        elif status_data.get("status") == "FAILURE":
                            raise Exception(f"TTS failed: {status_data}")
                        time.sleep(2)
                    
                    # Download segment audio (CAMB.AI returns FLAC format)
                    audio_resp = requests.get(
                        f"https://client.camb.ai/apis/tts-result/{run_id}",
                        headers=headers,
                        timeout=60
                    )
                    audio_segments.append(AudioSegment.from_file(io.BytesIO(audio_resp.content), format="flac"))
            
            # Combine all segments
            if audio_segments:
                combined = audio_segments[0]
                for seg in audio_segments[1:]:
                    combined += seg
                
                output = io.BytesIO()
                combined.export(output, format="wav")
                audio_bytes = output.getvalue()
            else:
                raise Exception("No audio segments generated")
        else:
            # Single speaker mode
            gender = voice_gender.get(project.get("voice", "sophea"), 2)
            
            payload = {
                "text": translated_text,
                "voice_id": 147319,
                "language": 92,
                "gender": gender
            }
            
            response = requests.post(
                "https://client.camb.ai/apis/tts",
                json=payload,
                headers=headers,
                timeout=30
            )
            response.raise_for_status()
            task_id = response.json().get("task_id")
            
            if not task_id:
                raise Exception(f"No task_id in response")
            
            # Poll for completion
            for _ in range(60):
                status_resp = requests.get(
                    f"https://client.camb.ai/apis/tts/{task_id}",
                    headers=headers,
                    timeout=30
                )
                status_data = status_resp.json()
                if status_data.get("status") == "SUCCESS":
                    run_id = status_data.get("run_id")
                    break
                elif status_data.get("status") == "FAILURE":
                    raise Exception(f"TTS failed: {status_data}")
                time.sleep(2)
            else:
                raise Exception("TTS timeout")
            
            # Download audio (CAMB.AI returns FLAC format)
            audio_resp = requests.get(
                f"https://client.camb.ai/apis/tts-result/{run_id}",
                headers=headers,
                timeout=60
            )
            # Convert FLAC to WAV
            audio_segment = AudioSegment.from_file(io.BytesIO(audio_resp.content), format="flac")
            output = io.BytesIO()
            audio_segment.export(output, format="wav")
            audio_bytes = output.getvalue()
        
        # Upload to storage
        path = f"{APP_NAME}/audio/{user.user_id}/{project_id}/dubbed_{uuid.uuid4().hex}.wav"
        result = put_object(path, audio_bytes, "audio/wav")
        
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {
                "dubbed_audio_path": result["path"],
                "status": "audio_ready",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    except Exception as e:
        logger.error(f"CAMB.AI TTS error: {str(e)}")
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": "error", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise HTTPException(status_code=500, detail=str(e))

# Generate dubbed video
@api_router.post("/projects/{project_id}/generate-video")
async def generate_video(project_id: str, authorization: str = Header(None)):
    """Merge dubbed audio with original video"""
    user = await get_current_user(authorization)
    
    project = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("file_type") != "video":
        raise HTTPException(status_code=400, detail="Original file is not a video")
    
    if not project.get("dubbed_audio_path"):
        raise HTTPException(status_code=400, detail="No dubbed audio available. Generate audio first.")
    
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"status": "generating_video", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    try:
        # Download original video
        video_data, _ = get_object(project["original_file_path"])
        
        # Download dubbed audio
        audio_data, _ = get_object(project["dubbed_audio_path"])
        
        with tempfile.TemporaryDirectory() as temp_dir:
            ext = project["original_filename"].split(".")[-1] if "." in project["original_filename"] else "mp4"
            video_path = os.path.join(temp_dir, f"video.{ext}")
            audio_path = os.path.join(temp_dir, "dubbed_audio.mp3")
            output_path = os.path.join(temp_dir, f"output.{ext}")
            
            with open(video_path, "wb") as f:
                f.write(video_data)
            with open(audio_path, "wb") as f:
                f.write(audio_data)
            
            # Merge audio with video
            merge_audio_with_video(video_path, audio_path, output_path)
            
            # Read output and upload
            with open(output_path, "rb") as f:
                output_data = f.read()
            
            storage_path = f"{APP_NAME}/video/{user.user_id}/{project_id}/dubbed_{uuid.uuid4().hex}.{ext}"
            result = put_object(storage_path, output_data, f"video/{ext}")
            
            await db.projects.update_one(
                {"project_id": project_id},
                {"$set": {
                    "dubbed_video_path": result["path"],
                    "status": "completed",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            return await db.projects.find_one({"project_id": project_id}, {"_id": 0})
            
    except Exception as e:
        logger.error(f"Video generation error: {str(e)}")
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": "error", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise HTTPException(status_code=500, detail=str(e))

# Download file
@api_router.get("/files/{path:path}")
async def download_file(path: str, authorization: str = Header(None), auth: str = Query(None)):
    """Download a file from storage"""
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    user = await get_current_user(auth_header)
    
    # Verify user has access
    if user.user_id not in path:
        raise HTTPException(status_code=403, detail="Access denied")
    
    data, content_type = get_object(path)
    return Response(content=data, media_type=content_type)

# Quick translate endpoint
@api_router.post("/translate")
async def quick_translate(request: TranslateRequest, authorization: str = Header(None)):
    """Quick translate Chinese to Khmer"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    user = await get_current_user(authorization)
    
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"quick_translate_{uuid.uuid4().hex[:8]}",
        system_message="You are a professional Chinese to Khmer translator. Translate the given Chinese text to Khmer accurately while preserving the meaning and tone. Only output the Khmer translation, nothing else."
    )
    chat.with_model("openai", "gpt-5.2")
    
    user_message = UserMessage(text=request.chinese_text)
    translated = await chat.send_message(user_message)
    
    return {"original": request.chinese_text, "translated": translated}

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized successfully")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
