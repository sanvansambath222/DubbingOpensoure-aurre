from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Response, Query, BackgroundTasks
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

# Object Storage
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "khmer-dubbing"
storage_key = None

def init_storage():
    """Initialize storage - call once at startup"""
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload file to storage"""
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=300
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str) -> tuple:
    """Download file from storage"""
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
        "status": "created",
        "voice": "alloy",
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

# Transcribe audio/video
@api_router.post("/projects/{project_id}/transcribe")
async def transcribe_project(project_id: str, authorization: str = Header(None)):
    """Transcribe Chinese audio from uploaded file using Whisper"""
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
            audio_path = os.path.join(temp_dir, "audio.mp3")
            
            # Write input file
            with open(input_path, "wb") as f:
                f.write(file_data)
            
            # Extract audio if video
            if project.get("file_type") == "video":
                extract_audio_from_video(input_path, audio_path)
                
                # Upload extracted audio to storage
                with open(audio_path, "rb") as f:
                    audio_data = f.read()
                audio_storage_path = f"{APP_NAME}/audio/{user.user_id}/{project_id}/extracted_{uuid.uuid4().hex}.mp3"
                put_object(audio_storage_path, audio_data, "audio/mpeg")
                
                await db.projects.update_one(
                    {"project_id": project_id},
                    {"$set": {"extracted_audio_path": audio_storage_path}}
                )
            else:
                audio_path = input_path
            
            # Transcribe using Whisper
            stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
            
            with open(audio_path, "rb") as audio_file:
                response = await stt.transcribe(
                    file=audio_file,
                    model="whisper-1",
                    language="zh",  # Chinese
                    response_format="text"
                )
            
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

# Translation
@api_router.post("/projects/{project_id}/translate")
async def translate_project(project_id: str, authorization: str = Header(None)):
    """Translate Chinese text to Khmer"""
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
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"translate_{project_id}",
            system_message="You are a professional Chinese to Khmer translator. Translate the given Chinese text to Khmer accurately while preserving the meaning and tone. Only output the Khmer translation, nothing else."
        )
        chat.with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=project["original_text"])
        translated = await chat.send_message(user_message)
        
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {
                "translated_text": translated,
                "status": "translated",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    except Exception as e:
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": "error", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise HTTPException(status_code=500, detail=str(e))

# Generate dubbed audio
@api_router.post("/projects/{project_id}/generate-audio")
async def generate_audio(project_id: str, authorization: str = Header(None)):
    """Generate Khmer dubbed audio using TTS"""
    from emergentintegrations.llm.openai import OpenAITextToSpeech
    
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
        tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        
        audio_bytes = await tts.generate_speech(
            text=project["translated_text"],
            model="tts-1-hd",
            voice=project.get("voice", "alloy")
        )
        
        # Upload to storage
        path = f"{APP_NAME}/audio/{user.user_id}/{project_id}/dubbed_{uuid.uuid4().hex}.mp3"
        result = put_object(path, audio_bytes, "audio/mpeg")
        
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
            result = put_object(output_data, output_data, f"video/{ext}")
            
            # Fix: Use correct path
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
