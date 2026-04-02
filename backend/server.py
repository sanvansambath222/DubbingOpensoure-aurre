from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Response, Query, Form, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
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
import io

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
CAMB_API_KEY = os.environ.get('CAMB_API_KEY')
GOOGLE_CLOUD_TTS_API_KEY = os.environ.get('GOOGLE_CLOUD_TTS_API_KEY')
GEMINI_TTS_API_KEY = os.environ.get('GEMINI_TTS_API_KEY')

GOOGLE_TTS_SYNTHESIZE_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
GOOGLE_TTS_VOICES_URL = "https://texttospeech.googleapis.com/v1/voices"

APP_NAME = "voxidub"
LOCAL_STORAGE_DIR = Path("/app/uploads")
LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Background task queue
processing_queue = asyncio.Queue()
queue_status = {}  # project_id -> {"position": int, "status": str, "step": str, "progress": int, "total": int, "started_at": float}

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


def delete_object(path: str):
    """Delete a file from local storage."""
    file_path = LOCAL_STORAGE_DIR / path
    if file_path.exists():
        file_path.unlink()

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


# --- Extracted helpers for transcribe_segments ---

def merge_whisper_segments(raw_segments: list) -> list:
    """Merge short Whisper segments into natural sentences."""
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
            if gap < 0.5 and current_len < 5.0 and len(current["text"]) < 40:
                current["end"] = end
                current["text"] += text
            else:
                merged.append(current)
                current = {"start": start, "end": end, "text": text}
    if current:
        merged.append(current)
    return merged


def build_actors_from_segments(segments: list) -> list:
    """Build actor list from detected speaker info in segments."""
    speaker_info = {}
    speaker_roles = {}
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
        info = speaker_info[spk]
        info["last_end"] = max(info["last_end"], seg.get("end", 0))
        info["first_start"] = min(info["first_start"], seg.get("start", 0))
        info["total_time"] += (seg.get("end", 0) - seg.get("start", 0))
        info["line_count"] += 1

    actors = []
    for spk, info in speaker_info.items():
        role = speaker_roles.get(spk, "")
        gender_tag = "Boy" if info["gender"] == "male" else "Girl"
        label = f"{role} ({gender_tag})" if role else gender_tag
        actors.append({
            "id": spk, "label": label, "gender": info["gender"],
            "role": role, "voice": "mms_khmer" if info["gender"] == "male" else "sophea",
            "custom_voice": None, "total_speaking_time": round(info["total_time"], 1),
            "line_count": info["line_count"],
            "first_start": round(info["first_start"], 1),
            "last_end": round(info["last_end"], 1)
        })
    return actors


def apply_speaker_detections(segments: list, detections: list) -> list:
    """Apply GPT speaker detection results to segments."""
    for d in detections:
        idx = d.get("idx", -1)
        if 0 <= idx < len(segments):
            gender = d.get("gender", "female")
            speaker = d.get("speaker", "SPEAKER_00")
            role = d.get("role", "")
            segments[idx]["gender"] = gender
            segments[idx]["speaker"] = speaker
            segments[idx]["voice"] = "mms_khmer" if gender == "male" else "sophea"
            if role:
                segments[idx]["role"] = role
    return segments


def apply_fallback_speakers(segments: list) -> list:
    """Fallback speaker assignment when GPT detection fails."""
    for i in range(len(segments)):
        segments[i]["speaker"] = f"SPEAKER_{str(i % 2).zfill(2)}"
        segments[i]["gender"] = "female" if i % 2 == 0 else "male"
        segments[i]["voice"] = "sophea" if i % 2 == 0 else "mms_khmer"
    return segments


# --- SpeechBrain Audio-based Speaker Detection ---
_speaker_classifier = None

def get_speaker_classifier():
    """Lazy load SpeechBrain ECAPA-TDNN speaker embedding model."""
    global _speaker_classifier
    if _speaker_classifier is None:
        from speechbrain.inference.speaker import EncoderClassifier
        _speaker_classifier = EncoderClassifier.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb",
            savedir="/root/.cache/spkrec-ecapa"
        )
        logger.info("SpeechBrain ECAPA-TDNN speaker model loaded")
    return _speaker_classifier

def detect_speakers_audio(audio_path: str, segments: list) -> list:
    """Detect speakers from audio using SpeechBrain embeddings + clustering.
    Also detects gender using pitch analysis (F0)."""
    import torch
    import numpy as np
    import wave
    import struct
    from sklearn.cluster import AgglomerativeClustering

    classifier = get_speaker_classifier()
    
    # Read full audio
    with wave.open(audio_path, 'r') as wf:
        sr = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)
        all_samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

    embeddings = []
    valid_indices = []
    pitches = []

    for i, seg in enumerate(segments):
        start_sample = int(seg["start"] * sr)
        end_sample = int(seg["end"] * sr)
        chunk = all_samples[start_sample:end_sample]
        
        # Skip very short segments (< 0.3s)
        if len(chunk) < int(0.3 * sr):
            embeddings.append(None)
            pitches.append(None)
            continue
        
        # Get speaker embedding
        try:
            audio_tensor = torch.tensor(chunk).unsqueeze(0)
            emb = classifier.encode_batch(audio_tensor).squeeze().detach().numpy()
            embeddings.append(emb)
            valid_indices.append(i)
        except Exception as e:
            logger.warning(f"Embedding failed for segment {i}: {e}")
            embeddings.append(None)
        
        # Pitch analysis for gender detection (autocorrelation F0)
        try:
            # Downsample to 16kHz if needed
            chunk_16k = chunk
            frame_len = len(chunk_16k)
            if frame_len < sr * 0.1:
                pitches.append(None)
                continue
            # Autocorrelation to find fundamental frequency
            # Search between 70Hz (male) and 300Hz (female)
            min_lag = int(sr / 300)  # highest freq
            max_lag = int(sr / 70)   # lowest freq
            max_lag = min(max_lag, frame_len - 1)
            if min_lag >= max_lag:
                pitches.append(None)
                continue
            # Compute autocorrelation for lag range
            best_lag = min_lag
            best_corr = -1
            chunk_norm = chunk_16k - np.mean(chunk_16k)
            energy = np.sum(chunk_norm ** 2)
            if energy < 1e-6:
                pitches.append(None)
                continue
            for lag in range(min_lag, max_lag):
                corr = np.sum(chunk_norm[:frame_len-lag] * chunk_norm[lag:]) / energy
                if corr > best_corr:
                    best_corr = corr
                    best_lag = lag
            if best_corr > 0.3:  # voiced speech threshold
                f0 = sr / best_lag
                pitches.append(f0)
            else:
                pitches.append(None)
        except:
            pitches.append(None)

    # Cluster valid embeddings
    valid_embs = [embeddings[i] for i in valid_indices]
    
    if len(valid_embs) < 2:
        # Only one segment or less, assign single speaker
        for seg in segments:
            seg["speaker"] = "SPEAKER_00"
            seg["gender"] = "male"
            seg["voice"] = "mms_khmer"
        return segments

    emb_matrix = np.array(valid_embs)
    
    # Determine number of clusters (max 6 speakers)
    # Use distance threshold for automatic cluster count
    try:
        clustering = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=0.7,
            metric="cosine",
            linkage="average"
        ).fit(emb_matrix)
        labels = clustering.labels_
        n_speakers = len(set(labels))
        # Cap at 6 speakers
        if n_speakers > 6:
            clustering = AgglomerativeClustering(
                n_clusters=6, metric="cosine", linkage="average"
            ).fit(emb_matrix)
            labels = clustering.labels_
            n_speakers = 6
    except Exception:
        # Fallback: assume 2 speakers
        clustering = AgglomerativeClustering(
            n_clusters=2, metric="cosine", linkage="average"
        ).fit(emb_matrix)
        labels = clustering.labels_
        n_speakers = 2

    logger.info(f"SpeechBrain clustering: {n_speakers} speakers detected from {len(valid_embs)} segments")

    # Map cluster labels to SPEAKER_XX
    label_map = {}
    next_id = 0
    for label in labels:
        if label not in label_map:
            label_map[label] = f"SPEAKER_{str(next_id).zfill(2)}"
            next_id += 1

    # Assign speakers to valid segments
    for idx_pos, seg_idx in enumerate(valid_indices):
        speaker_label = label_map[labels[idx_pos]]
        segments[seg_idx]["speaker"] = speaker_label

    # Assign nearest speaker to invalid (short) segments
    for i, seg in enumerate(segments):
        if embeddings[i] is None and i not in valid_indices:
            # Copy from nearest valid neighbor
            for offset in [1, -1, 2, -2, 3, -3]:
                neighbor = i + offset
                if 0 <= neighbor < len(segments) and neighbor in valid_indices:
                    segments[i]["speaker"] = segments[neighbor]["speaker"]
                    break

    # Gender detection per speaker using average pitch
    speaker_pitches = {}
    for i, seg in enumerate(segments):
        spk = seg["speaker"]
        if pitches[i] is not None:
            if spk not in speaker_pitches:
                speaker_pitches[spk] = []
            speaker_pitches[spk].append(pitches[i])

    speaker_gender = {}
    for spk, plist in speaker_pitches.items():
        avg_pitch = sum(plist) / len(plist)
        # Male: ~85-170 Hz, Female: ~165-255 Hz
        speaker_gender[spk] = "male" if avg_pitch < 160 else "female"
        logger.info(f"{spk}: avg pitch={avg_pitch:.0f}Hz → {speaker_gender[spk]}")

    # Apply gender and voice to all segments
    for seg in segments:
        gender = speaker_gender.get(seg["speaker"], "female")
        seg["gender"] = gender
        seg["voice"] = "mms_khmer" if gender == "male" else "sophea"

    return segments



# --- Extracted helpers for generate_audio_segments ---

def get_media_duration_safe(project: dict) -> int:
    """Get media duration in ms, returns 0 on failure."""
    try:
        file_data, _ = get_object(project["original_file_path"])
        ext = project['original_filename'].split('.')[-1] if '.' in project['original_filename'] else 'mp4'
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
            tmp.write(file_data)
            tmp_path = tmp.name
        duration_ms = int(get_media_duration(tmp_path) * 1000)
        os.unlink(tmp_path)
        return duration_ms
    except Exception as e:
        logger.warning(f"Could not get media duration: {e}")
        return 0


def separate_custom_and_tts_segments(segments: list, actor_voice_map: dict) -> tuple:
    """Separate segments into custom audio pairs and TTS-needed segments.
    Custom audio is auto-sped-up to fit segment duration."""
    import io
    from pydub import AudioSegment
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
                # Auto-fit uploaded voice to segment duration
                seg_duration_ms = int((seg.get("end", 0) - seg.get("start", 0)) * 1000)
                if seg_duration_ms > 0:
                    audio_seg = fit_audio_to_duration(audio_seg, seg_duration_ms)
                custom_pairs.append((seg, audio_seg))
                continue
            except Exception as e:
                logger.warning(f"Custom audio load failed: {e}, falling back to TTS")
        if not seg.get("translated"):
            continue
        tts_segments.append(seg)
    return custom_pairs, tts_segments


def mix_audio_timeline(segment_audio_pairs: list, segments: list, total_duration_ms: int, has_timestamps: bool):
    """Mix audio segments into a timeline-aligned or concatenated output."""
    from pydub import AudioSegment
    if has_timestamps and total_duration_ms > 0:
        combined = AudioSegment.silent(duration=total_duration_ms)
        for seg, audio in segment_audio_pairs:
            start_ms = int(seg.get("start", 0) * 1000)
            seg_duration_ms = int((seg.get("end", 0) - seg.get("start", 0)) * 1000)
            audio = fit_audio_to_duration(audio, seg_duration_ms)
            combined = combined.overlay(audio, position=start_ms)
    else:
        combined = segment_audio_pairs[0][1]
        for _, audio in segment_audio_pairs[1:]:
            combined += audio
    return combined


def extract_background_audio(video_path: str, project_id: str = None) -> bytes:
    """Extract audio from video, use Demucs AI (Python API) to remove human voice, keep only background music/sfx.
    Processes in 30-second chunks for progress tracking and lower memory usage."""
    
    CHUNK_SECONDS = 30  # Process 30 seconds at a time
    
    # Step 1: Extract audio from video as WAV (44100Hz stereo for Demucs)
    full_audio = video_path + ".full_audio.wav"
    cmd1 = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2",
        full_audio
    ]
    r1 = subprocess.run(cmd1, capture_output=True, text=True)
    if r1.returncode != 0:
        logger.warning(f"Failed to extract audio: {r1.stderr[:200]}")
        return None

    # Step 2: Use Demucs AI Python API for vocal separation (chunked)
    try:
        import torch
        import soundfile as sf
        import numpy as np
        from demucs.pretrained import get_model
        from demucs.apply import apply_model

        logger.info("Running Demucs AI vocal separation (chunked)...")
        
        # Load audio
        wav_np, sr = sf.read(full_audio)
        if wav_np.ndim == 1:
            wav = torch.from_numpy(wav_np).float().unsqueeze(0)
        else:
            wav = torch.from_numpy(wav_np.T).float()
        
        # Load model
        model = get_model('htdemucs')
        model.eval()
        model.cpu()
        
        # Resample if needed
        if sr != model.samplerate:
            from scipy.signal import resample
            num_samples = int(wav.shape[-1] * model.samplerate / sr)
            wav_np2 = wav.numpy()
            resampled = np.array([resample(ch, num_samples) for ch in wav_np2])
            wav = torch.from_numpy(resampled).float()
            sr = model.samplerate
        
        # Ensure stereo
        if wav.shape[0] == 1:
            wav = wav.repeat(2, 1)
        
        # Split into chunks
        chunk_samples = CHUNK_SECONDS * sr
        total_samples = wav.shape[-1]
        num_chunks = max(1, (total_samples + chunk_samples - 1) // chunk_samples)
        total_duration = total_samples / sr
        
        logger.info(f"Demucs: {total_duration:.0f}s audio → {num_chunks} chunks of {CHUNK_SECONDS}s")
        
        # Update progress
        if project_id and project_id in queue_status:
            queue_status[project_id].update({
                "step": "removing_vocals",
                "progress": 0,
                "total": num_chunks,
                "demucs_chunks": num_chunks,
                "demucs_duration": round(total_duration, 1)
            })
        
        all_no_vocals = []
        
        for chunk_idx in range(num_chunks):
            start = chunk_idx * chunk_samples
            end = min(start + chunk_samples, total_samples)
            chunk = wav[:, start:end]
            
            # Normalize chunk
            ref = chunk.mean(0)
            mean_val = ref.mean()
            std_val = ref.std()
            chunk_norm = (chunk - mean_val) / (std_val + 1e-8)
            
            # Run separation on chunk
            with torch.no_grad():
                sources = apply_model(model, chunk_norm.unsqueeze(0), device='cpu')
            
            # Sum all non-vocal sources
            vocals_idx = model.sources.index('vocals')
            no_vocals = torch.zeros_like(sources[0, 0])
            for i, name in enumerate(model.sources):
                if name != 'vocals':
                    no_vocals += sources[0, i]
            
            # Denormalize
            no_vocals = no_vocals * (std_val + 1e-8) + mean_val
            all_no_vocals.append(no_vocals)
            
            # Update progress
            if project_id and project_id in queue_status:
                queue_status[project_id].update({
                    "progress": chunk_idx + 1,
                    "total": num_chunks,
                })
            
            logger.info(f"Demucs chunk {chunk_idx + 1}/{num_chunks} done")
            
            # Free chunk memory
            del sources, chunk, chunk_norm, no_vocals
        
        # Concatenate all chunks
        final_no_vocals = torch.cat(all_no_vocals, dim=-1)
        
        # Save to temp file as stereo
        temp_stereo = video_path + ".bg_stereo.wav"
        sf.write(temp_stereo, final_no_vocals.numpy().T, sr)
        
        # Update progress - mixing step
        if project_id and project_id in queue_status:
            queue_status[project_id].update({"step": "mixing_audio"})
        
        # Convert to mono 24000Hz for mixing with TTS
        bg_audio = video_path + ".bg_audio.wav"
        cmd3 = ["ffmpeg", "-y", "-i", temp_stereo, "-ar", "24000", "-ac", "1", bg_audio]
        subprocess.run(cmd3, capture_output=True, text=True)
        
        with open(bg_audio, "rb") as f:
            data = f.read()
        
        # Cleanup
        for p in [full_audio, temp_stereo, bg_audio]:
            try: os.unlink(p)
            except: pass
        
        # Free memory
        del model, wav, final_no_vocals, all_no_vocals
        torch.cuda.empty_cache() if torch.cuda.is_available() else None
        import gc; gc.collect()
        
        logger.info("Demucs vocal separation successful!")
        return data
        
    except Exception as e:
        logger.warning(f"Demucs AI failed: {e}")
        try: os.unlink(full_audio)
        except: pass
    
    # Fallback: return full audio (with voice) if Demucs fails
    logger.warning("Demucs failed, falling back to full audio")
    fallback = video_path + ".bg_fallback.wav"
    cmd_fb = ["ffmpeg", "-y", "-i", video_path, "-vn", "-ar", "24000", "-ac", "1", fallback]
    subprocess.run(cmd_fb, capture_output=True, text=True)
    try:
        with open(fallback, "rb") as f:
            data = f.read()
        os.unlink(fallback)
        return data
    except Exception:
        return None


def mix_with_background(dubbed_audio: 'AudioSegment', bg_audio_bytes: bytes, bg_volume: int = -12) -> 'AudioSegment':
    """Mix dubbed TTS audio with background audio (original music/sfx).
    bg_volume: how much to reduce background volume in dB (negative = quieter)."""
    import io
    from pydub import AudioSegment as AS
    try:
        bg = AS.from_file(io.BytesIO(bg_audio_bytes), format="wav")
        # Lower background volume to not overpower TTS voices
        bg = bg + bg_volume
        # Match length
        if len(bg) > len(dubbed_audio):
            bg = bg[:len(dubbed_audio)]
        elif len(bg) < len(dubbed_audio):
            bg = bg + AS.silent(duration=len(dubbed_audio) - len(bg))
        # Mix
        return dubbed_audio.overlay(bg)
    except Exception as e:
        logger.warning(f"Failed to mix background audio: {e}")
        return dubbed_audio


def fit_audio_to_duration(audio, target_duration_ms: int):
    """Speed up audio to fit within target duration using FFmpeg atempo (fast)."""
    if target_duration_ms <= 0 or len(audio) <= target_duration_ms:
        return audio
    speed_factor = len(audio) / target_duration_ms
    if speed_factor > 2.5:
        speed_factor = 2.5
    if speed_factor < 1.05:
        return audio
    # Use FFmpeg atempo for fast processing instead of pydub.speedup()
    try:
        import io
        from pydub import AudioSegment
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_in:
            audio.export(tmp_in.name, format="wav")
            in_path = tmp_in.name
        out_path = in_path.replace(".wav", "_fast.wav")
        # Build atempo filter chain (atempo supports 0.5-2.0 range, chain for higher)
        filters = []
        remaining = speed_factor
        while remaining > 2.0:
            filters.append("atempo=2.0")
            remaining /= 2.0
        filters.append(f"atempo={remaining:.4f}")
        filter_str = ",".join(filters)
        cmd = ["ffmpeg", "-y", "-i", in_path, "-af", filter_str, "-ac", "1", "-ar", "24000", out_path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and os.path.exists(out_path):
            fitted = AudioSegment.from_file(out_path)
            os.unlink(in_path)
            os.unlink(out_path)
            return fitted
        os.unlink(in_path)
        if os.path.exists(out_path):
            os.unlink(out_path)
        return audio[:target_duration_ms]
    except Exception as e:
        logger.warning(f"FFmpeg atempo failed, truncating: {e}")
        return audio[:target_duration_ms]


# --- Constants ---
TTS_BATCH_SIZE = 5
TRANSLATE_CHUNK_SIZE = 50
POLL_INTERVAL_S = 1.5
REQUEST_TIMEOUT_MS = 300000
AUTO_PROCESS_TIMEOUT_MS = 600000


# FastAPI app
app = FastAPI()
api_router = APIRouter(prefix="/api")


def strip_oid(doc):
    """Remove MongoDB _id from document before returning as JSON."""
    if doc and isinstance(doc, dict):
        doc.pop("_id", None)
    return doc

# Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    password_hash: Optional[str] = None
    auth_provider: Optional[str] = None
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
    target_language: str = "km"

LANGUAGE_NAMES = {
    "zh": "Chinese", "th": "Thai", "vi": "Vietnamese", "ko": "Korean",
    "ja": "Japanese", "en": "English", "km": "Khmer", "lo": "Lao",
    "my": "Burmese", "id": "Indonesian", "ms": "Malay", "fr": "French",
    "de": "German", "es": "Spanish", "pt": "Portuguese", "ru": "Russian",
    "ar": "Arabic", "hi": "Hindi", "tl": "Tagalog", "it": "Italian",
}

# Edge TTS voices per output language: {lang_code: {male: [voices], female: [voices]}}
EDGE_TTS_VOICES = {
    "km": {"male": [{"id": "dara", "name": "Piseth (Boy)", "voice": "km-KH-PisethNeural"},
                     {"id": "mms_khmer", "name": "Meta AI (Boy)", "voice": "mms-tts-khm", "provider": "mms"}],
            "female": [{"id": "sophea", "name": "Sreymom (Girl)", "voice": "km-KH-SreymomNeural"},
                       {"id": "mms_khmer_f", "name": "Meta AI (Girl)", "voice": "mms-tts-khm-f", "provider": "mms"}]},
    "th": {"male": [{"id": "th_m1", "name": "Niwat (Boy)", "voice": "th-TH-NiwatNeural"}],
            "female": [{"id": "th_f1", "name": "Premwadee (Girl)", "voice": "th-TH-PremwadeeNeural"}]},
    "vi": {"male": [{"id": "vi_m1", "name": "NamMinh (Boy)", "voice": "vi-VN-NamMinhNeural"}],
            "female": [{"id": "vi_f1", "name": "HoaiMy (Girl)", "voice": "vi-VN-HoaiMyNeural"}]},
    "ko": {"male": [{"id": "ko_m1", "name": "InJoon (Boy)", "voice": "ko-KR-InJoonNeural"}],
            "female": [{"id": "ko_f1", "name": "SunHi (Girl)", "voice": "ko-KR-SunHiNeural"}]},
    "ja": {"male": [{"id": "ja_m1", "name": "Keita (Boy)", "voice": "ja-JP-KeitaNeural"}],
            "female": [{"id": "ja_f1", "name": "Nanami (Girl)", "voice": "ja-JP-NanamiNeural"}]},
    "en": {"male": [{"id": "en_m1", "name": "Guy (Boy)", "voice": "en-US-GuyNeural"}],
            "female": [{"id": "en_f1", "name": "Jenny (Girl)", "voice": "en-US-JennyNeural"}]},
    "zh": {"male": [{"id": "zh_m1", "name": "YunXi (Boy)", "voice": "zh-CN-YunxiNeural"}],
            "female": [{"id": "zh_f1", "name": "XiaoXiao (Girl)", "voice": "zh-CN-XiaoxiaoNeural"}]},
    "id": {"male": [{"id": "id_m1", "name": "Ardi (Boy)", "voice": "id-ID-ArdiNeural"}],
            "female": [{"id": "id_f1", "name": "Gadis (Girl)", "voice": "id-ID-GadisNeural"}]},
    "hi": {"male": [{"id": "hi_m1", "name": "Madhur (Boy)", "voice": "hi-IN-MadhurNeural"}],
            "female": [{"id": "hi_f1", "name": "Swara (Girl)", "voice": "hi-IN-SwaraNeural"}]},
    "es": {"male": [{"id": "es_m1", "name": "Alvaro (Boy)", "voice": "es-ES-AlvaroNeural"}],
            "female": [{"id": "es_f1", "name": "Elvira (Girl)", "voice": "es-ES-ElviraNeural"}]},
    "fr": {"male": [{"id": "fr_m1", "name": "Henri (Boy)", "voice": "fr-FR-HenriNeural"}],
            "female": [{"id": "fr_f1", "name": "Denise (Girl)", "voice": "fr-FR-DeniseNeural"}]},
    "tl": {"male": [{"id": "tl_m1", "name": "Angelo (Boy)", "voice": "fil-PH-AngeloNeural"}],
            "female": [{"id": "tl_f1", "name": "Blessica (Girl)", "voice": "fil-PH-BlessicaNeural"}]},
    "de": {"male": [{"id": "de_m1", "name": "Conrad (Boy)", "voice": "de-DE-ConradNeural"}],
            "female": [{"id": "de_f1", "name": "Katja (Girl)", "voice": "de-DE-KatjaNeural"}]},
    "pt": {"male": [{"id": "pt_m1", "name": "Duarte (Boy)", "voice": "pt-BR-AntonioNeural"}],
            "female": [{"id": "pt_f1", "name": "Francisca (Girl)", "voice": "pt-BR-FranciscaNeural"}]},
    "ru": {"male": [{"id": "ru_m1", "name": "Dmitry (Boy)", "voice": "ru-RU-DmitryNeural"}],
            "female": [{"id": "ru_f1", "name": "Svetlana (Girl)", "voice": "ru-RU-SvetlanaNeural"}]},
    "ar": {"male": [{"id": "ar_m1", "name": "Hamed (Boy)", "voice": "ar-SA-HamedNeural"}],
            "female": [{"id": "ar_f1", "name": "Zariyah (Girl)", "voice": "ar-SA-ZariyahNeural"}]},
    "it": {"male": [{"id": "it_m1", "name": "Diego (Boy)", "voice": "it-IT-DiegoNeural"}],
            "female": [{"id": "it_f1", "name": "Elsa (Girl)", "voice": "it-IT-ElsaNeural"}]},
    "ms": {"male": [{"id": "ms_m1", "name": "Osman (Boy)", "voice": "ms-MY-OsmanNeural"}],
            "female": [{"id": "ms_f1", "name": "Yasmin (Girl)", "voice": "ms-MY-YasminNeural"}]},
    "lo": {"male": [{"id": "lo_m1", "name": "Chanthavong (Boy)", "voice": "lo-LA-ChanthavongNeural"}],
            "female": [{"id": "lo_f1", "name": "Keomany (Girl)", "voice": "lo-LA-KeomanyNeural"}]},
    "my": {"male": [{"id": "my_m1", "name": "Thiha (Boy)", "voice": "my-MM-ThihaNeural"}],
            "female": [{"id": "my_f1", "name": "Nilar (Girl)", "voice": "my-MM-NilarNeural"}]},
}

def get_edge_voice(lang_code, gender, voice_id=None):
    """Get the Edge TTS voice name for a language and gender."""
    lang_voices = EDGE_TTS_VOICES.get(lang_code, EDGE_TTS_VOICES["km"])
    voices = lang_voices.get(gender, lang_voices.get("female", []))
    if voice_id and not voice_id.startswith("mms_") and not voice_id.startswith("klea_"):
        for v in voices:
            if v["id"] == voice_id:
                return v["voice"]
    # Return first non-MMS/KLEA voice as default
    for v in voices:
        if not v.get("provider"):
            return v["voice"]
    return "km-KH-SreymomNeural"

def is_mms_voice(voice_id):
    """Check if a voice_id is a Meta MMS voice."""
    return voice_id and (voice_id.startswith("mms_"))

def is_mms_female(voice_id):
    """Check if a voice_id is the MMS female variant."""
    return voice_id == "mms_khmer_f"

def is_klea_voice(voice_id):
    """Check if a voice_id is a KLEA voice."""
    return voice_id and voice_id.startswith("klea_")

# Meta MMS TTS model (lazy loaded)
_mms_model = None
_mms_tokenizer = None

def get_mms_model():
    """Lazy load the Meta MMS Khmer TTS model."""
    global _mms_model, _mms_tokenizer
    if _mms_model is None:
        from transformers import VitsModel, AutoTokenizer
        logger.info("Loading Meta MMS Khmer TTS model...")
        _mms_model = VitsModel.from_pretrained('/root/.cache/mms-tts-khm')
        _mms_tokenizer = AutoTokenizer.from_pretrained('/root/.cache/mms-tts-khm')
        _mms_model.eval()
        logger.info("Meta MMS Khmer model loaded!")
    return _mms_model, _mms_tokenizer

def generate_mms_tts(text: str, output_path: str, speed: float = 1.0, female: bool = False):
    """Generate Khmer speech using Meta MMS TTS. Speed: 0.5=slow, 1.0=normal, 2.0=fast. female=True raises pitch. Returns True on success."""
    import torch
    import numpy as np
    import scipy.io.wavfile as wavfile
    
    model, tokenizer = get_mms_model()
    inputs = tokenizer(text, return_tensors="pt")
    
    with torch.no_grad():
        output = model(**inputs).waveform
    
    audio = output.squeeze().cpu().numpy()
    sr = model.config.sampling_rate
    
    # Build ffmpeg filter chain
    filters = []
    
    # Female pitch shift: raise pitch 30%
    if female:
        filters.append(f"asetrate={sr}*1.3")
        filters.append("atempo=0.769")  # 1/1.3 to keep same duration
    
    # Speed adjustment
    if speed != 1.0 and speed > 0:
        sp = max(0.5, min(3.0, speed))
        filters.append(f"atempo={sp}")
    
    # Always resample to original sr at the end
    filters.append(f"aresample={sr}")
    
    if filters:
        temp_path = output_path + ".tmp.wav"
        wavfile.write(temp_path, rate=sr, data=audio)
        filter_str = ",".join(filters)
        cmd = ["ffmpeg", "-y", "-i", temp_path, "-af", filter_str, output_path]
        subprocess.run(cmd, capture_output=True, text=True)
        try: os.unlink(temp_path)
        except: pass
    else:
        wavfile.write(output_path, rate=sr, data=audio)
    return True

# KLEA Khmer TTS model (lazy loaded, word-by-word)
_klea_model = None
_klea_hps = None

def get_klea_model():
    """Lazy load the KLEA Khmer word TTS model."""
    global _klea_model, _klea_hps
    if _klea_model is None:
        import sys
        # KLEA needs G_60000.pth in cwd
        original_cwd = os.getcwd()
        os.chdir("/root/.cache/klea")
        
        from klea.models import SynthesizerTrn
        from klea import utils, commons
        from importlib.resources import files
        from pathlib import Path
        
        resource_path = files('klea').joinpath('config.json')
        _klea_hps = utils.get_hparams_from_file(resource_path)
        
        _pad = '_'
        _punctuation = '. '
        _letters_ipa = 'acefhijklmnoprstuwzĕŋŏŭɑɓɔɗəɛɡɨɲʋʔʰː'
        symbols = [_pad] + list(_punctuation) + list(_letters_ipa)
        
        _klea_model = SynthesizerTrn(
            len(symbols),
            _klea_hps.data.filter_length // 2 + 1,
            _klea_hps.train.segment_size // _klea_hps.data.hop_length,
            **_klea_hps.model
        )
        _klea_model.eval()
        utils.load_checkpoint("G_60000.pth", _klea_model, None)
        
        os.chdir(original_cwd)
        logger.info("KLEA Khmer word TTS model loaded!")
    return _klea_model, _klea_hps

def generate_klea_tts(text: str, output_path: str):
    """Generate Khmer speech using KLEA (word by word, then concatenate)."""
    import torch
    import numpy as np
    from scipy.io.wavfile import write as wav_write
    from pydub import AudioSegment
    from klea.khmer_phonemizer import phonemize_single
    from klea import commons
    
    _pad = '_'
    _punctuation = '. '
    _letters_ipa = 'acefhijklmnoprstuwzĕŋŏŭɑɓɔɗəɛɡɨɲʋʔʰː'
    symbols = [_pad] + list(_punctuation) + list(_letters_ipa)
    _symbol_to_id = {s: i for i, s in enumerate(symbols)}
    
    def text_to_sequence(txt):
        return [_symbol_to_id[s] for s in txt if s in _symbol_to_id]
    
    model, hps = get_klea_model()
    
    # Split sentence into words
    words = text.strip().split()
    if not words:
        return False
    
    combined = AudioSegment.empty()
    silence = AudioSegment.silent(duration=80)  # 80ms gap between words
    
    for word in words:
        phonemes = " ".join(phonemize_single(word) + ["."])
        text_norm = text_to_sequence(phonemes)
        if hps.data.add_blank:
            text_norm = commons.intersperse(text_norm, 0)
        stn_tst = torch.LongTensor(text_norm)
        
        with torch.no_grad():
            x_tst = stn_tst.unsqueeze(0)
            x_tst_lengths = torch.LongTensor([stn_tst.size(0)])
            audio = model.infer(x_tst, x_tst_lengths, noise_scale=0.667, noise_scale_w=0.8, length_scale=1)[0][0, 0].data.cpu().float().numpy()
        
        # Save word to temp file
        word_path = output_path + f".word_{uuid.uuid4().hex[:6]}.wav"
        wav_write(word_path, rate=hps.data.sampling_rate, data=audio)
        word_audio = AudioSegment.from_file(word_path)
        combined += word_audio + silence
        try: os.unlink(word_path)
        except: pass
    
    combined.export(output_path, format="wav")
    return True

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
    return {"message": "VoxiDub API"}

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
    data = user.model_dump()
    data.pop("password_hash", None)
    return data

@api_router.post("/auth/logout")
async def logout(authorization: str = Header(None)):
    token = None
    if authorization:
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    return {"success": True}


# --- Email/Password Auth ---
import bcrypt

@api_router.post("/auth/register")
async def register_email(request: Request):
    body = await request.json()
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")
    name = body.get("name", "").strip()
    if not email or not password or not name:
        raise HTTPException(status_code=400, detail="Name, email and password required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "user_id": user_id, "email": email, "name": name,
        "picture": "", "password_hash": hashed,
        "auth_provider": "email",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    session_token = f"sess_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": user, "session_token": session_token}


@api_router.post("/auth/login")
async def login_email(request: Request):
    body = await request.json()
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    if not user_doc or not user_doc.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not bcrypt.checkpw(password.encode("utf-8"), user_doc["password_hash"].encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    session_token = f"sess_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "user_id": user_doc["user_id"], "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    user = {k: v for k, v in user_doc.items() if k != "password_hash"}
    return {"user": user, "session_token": session_token}

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
        "status": "created", "voice": "sophea", "female_voice": "sophea", "male_voice": "mms_khmer",
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
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.projects.update_one({"project_id": project_id}, {"$set": update_data})
    return await db.projects.find_one({"project_id": project_id}, {"_id": 0})

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Delete stored files
    for key in ["original_file_path", "dubbed_audio_path", "dubbed_video_path"]:
        file_path = project.get(key)
        if file_path:
            try:
                delete_object(file_path)
            except Exception:
                pass
    # Delete actor custom voices
    for actor in project.get("actors", []):
        if actor.get("custom_voice"):
            try:
                delete_object(actor["custom_voice"])
            except Exception:
                pass
    # Delete segment custom audio
    for seg in project.get("segments", []):
        if seg.get("custom_audio"):
            try:
                delete_object(seg["custom_audio"])
            except Exception:
                pass
    # Delete project folder
    project_dir = LOCAL_STORAGE_DIR / APP_NAME / project_id
    if project_dir.exists():
        import shutil
        try:
            shutil.rmtree(project_dir)
        except Exception:
            pass
    await db.projects.delete_one({"project_id": project_id})
    return {"success": True}

@api_router.delete("/projects")
async def delete_all_projects(authorization: str = Header(None)):
    user = await get_current_user(authorization)
    projects = await db.projects.find({"user_id": user.user_id}).to_list(1000)
    deleted = 0
    for project in projects:
        for key in ["original_file_path", "dubbed_audio_path", "dubbed_video_path"]:
            file_path = project.get(key)
            if file_path:
                try:
                    delete_object(file_path)
                except Exception:
                    pass
        project_dir = LOCAL_STORAGE_DIR / APP_NAME / project["project_id"]
        if project_dir.exists():
            import shutil
            try:
                shutil.rmtree(project_dir)
            except Exception:
                pass
        deleted += 1
    await db.projects.delete_many({"user_id": user.user_id})
    return {"success": True, "deleted": deleted}

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
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
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
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
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
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
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
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
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
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
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
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
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

            stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
            with open(audio_path, "rb") as audio_file:
                response = await stt.transcribe(file=audio_file, model="whisper-1", response_format="verbose_json")

            # Auto-detect language from Whisper response
            detected_lang = getattr(response, 'language', None) or 'zh'
            detected_lang_name = LANGUAGE_NAMES.get(detected_lang, detected_lang)
            logger.info(f"Auto-detected language: {detected_lang} ({detected_lang_name})")

            raw_segments = response.segments if hasattr(response, 'segments') else []
            
            # Step 1: Merge short segments into natural sentences
            merged = merge_whisper_segments(raw_segments)
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

            # Step 2: Detect speakers using SpeechBrain audio analysis
            if segments:
                try:
                    segments = await asyncio.get_event_loop().run_in_executor(
                        None, lambda: detect_speakers_audio(audio_path, segments)
                    )
                    unique_speakers = set(s["speaker"] for s in segments)
                    logger.info(f"SpeechBrain detected {len(unique_speakers)} unique speakers: {unique_speakers}")
                except Exception as e:
                    logger.warning(f"SpeechBrain speaker detection failed, using fallback: {e}")
                    segments = apply_fallback_speakers(segments)

            actors = build_actors_from_segments(segments)

            await db.projects.update_one(
                {"project_id": project_id},
                {"$set": {
                    "segments": segments, "actors": actors,
                    "detected_language": detected_lang,
                    "status": "transcribed", "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )

            # Step 2b: Detect ROLES in background (non-blocking, updates after save)
            async def _detect_roles_background():
                try:
                    detect_chat = LlmChat(
                        api_key=EMERGENT_LLM_KEY,
                        session_id=f"roles_{project_id}_{uuid.uuid4().hex[:6]}",
                        system_message="""You analyze dialogue to identify character ROLES only. Speakers and genders are already detected from audio.

ROLE DETECTION:
- Identify the character's role: Narrator, Boss, Wife, Doctor, Student, etc.
- If character has a proper name (e.g. 杜清禾), translate or romanize it to English (e.g. "Du Qinghe")
- ALL role names MUST be in English.

Return ONLY JSON array:
[{"idx": 0, "role": "Boss"}, {"idx": 1, "role": "Wife"}, ...]
Include ALL indices 0 to """ + str(len(segments)-1) + """. role MUST be in English."""
                    )
                    detect_chat.with_model("openai", "gpt-5.2")
                    
                    dialogue_lines = []
                    for i, s in enumerate(segments):
                        dialogue_lines.append(f"Line {i} ({s['speaker']}, {s['gender']}): \"{s['original']}\"")
                    all_text = "\n".join(dialogue_lines)
                    
                    result_text = await detect_chat.send_message(UserMessage(text=f"Identify roles for each line:\n\n{all_text}"))
                    if "[" in result_text:
                        start_idx = result_text.index("[")
                        end_idx = result_text.rindex("]") + 1
                        roles = json.loads(result_text[start_idx:end_idx])
                        # Update segments and actors in DB
                        proj = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
                        if proj:
                            segs = proj.get("segments", [])
                            for r in roles:
                                idx = r.get("idx", -1)
                                if 0 <= idx < len(segs) and r.get("role"):
                                    segs[idx]["role"] = r["role"]
                            new_actors = build_actors_from_segments(segs)
                            await db.projects.update_one(
                                {"project_id": project_id},
                                {"$set": {"segments": segs, "actors": new_actors, "updated_at": datetime.now(timezone.utc).isoformat()}}
                            )
                            logger.info(f"GPT role detection complete (background)")
                except Exception as e:
                    logger.warning(f"GPT role detection failed (non-critical): {e}")
            
            asyncio.create_task(_detect_roles_background())

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
async def translate_segments(project_id: str, target_language: str = Query("km"), authorization: str = Header(None)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    user = await get_current_user(authorization)
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
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
        target_lang_name = LANGUAGE_NAMES.get(target_language, target_language)
        
        import time as _time
        queue_status[project_id] = {"status": "processing", "step": "translating", "progress": 0, "total": len(segments), "started_at": _time.time()}
        
        # Chunk translation for long videos
        for chunk_start in range(0, len(segments), TRANSLATE_CHUNK_SIZE):
            chunk_end = min(chunk_start + TRANSLATE_CHUNK_SIZE, len(segments))
            chunk = segments[chunk_start:chunk_end]
            
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"translate_seg_{project_id}_{uuid.uuid4().hex[:6]}",
                system_message=f"""You are a {source_lang_name} to {target_lang_name} translator. Translate each numbered {source_lang_name} line to {target_lang_name}.
Return translations in exact same format: number followed by {target_lang_name} translation.
Only output translations, nothing else."""
            )
            chat.with_model("openai", "gpt-5.2")
            input_text = "\n".join([f"{i}: {s['original']}" for i, s in enumerate(chunk)])
            translations = await chat.send_message(UserMessage(text=input_text))
            lines = translations.strip().split("\n")
            for line in lines:
                if ":" in line:
                    try:
                        idx_str, trans = line.split(":", 1)
                        idx = int(idx_str.strip())
                        if idx < len(chunk):
                            segments[chunk_start + idx]["translated"] = trans.strip()
                    except (ValueError, IndexError):
                        pass
            queue_status[project_id]["progress"] = chunk_end
            logger.info(f"Translation chunk: {chunk_end}/{len(segments)} done")
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {
                "segments": segments,
                "status": "translated",
                "target_language": target_language,
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

# Preview single line TTS
class PreviewRequest(BaseModel):
    text: str
    gender: str = "female"
    speed: int = 2

@api_router.post("/projects/{project_id}/preview-tts")
async def preview_tts(project_id: str, req: PreviewRequest, authorization: str = Header(None)):
    import edge_tts
    user = await get_current_user(authorization)
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
    target_lang = project.get("target_language", "km") if project else "km"
    
    voice = get_edge_voice(target_lang, req.gender)
    rate = f"+{req.speed}%" if req.speed >= 0 else f"{req.speed}%"
    
    tts_path = os.path.join(tempfile.gettempdir(), f"preview_{uuid.uuid4().hex}.mp3")
    try:
        communicate = edge_tts.Communicate(req.text, voice=voice, rate=rate)
        await communicate.save(tts_path)
        with open(tts_path, "rb") as f:
            audio_data = f.read()
        return Response(content=audio_data, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tts_path):
            os.unlink(tts_path)

# Generate timestamp-aligned audio
@api_router.post("/projects/{project_id}/regenerate-segment/{segment_idx}")
async def regenerate_segment_audio(project_id: str, segment_idx: int, speed: int = Query(0), authorization: str = Header(None)):
    """Regenerate TTS audio for a single segment after text edit."""
    import io
    from pydub import AudioSegment
    import edge_tts

    user = await get_current_user(authorization)
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    segments = project.get("segments", [])
    if segment_idx < 0 or segment_idx >= len(segments):
        raise HTTPException(status_code=400, detail="Invalid segment index")
    
    seg = segments[segment_idx]
    if not seg.get("translated"):
        raise HTTPException(status_code=400, detail="No translation text")

    actors = project.get("actors", [])
    target_lang = project.get("target_language", "km")
    speaker = seg.get("speaker", "")
    seg_gender = seg.get("gender", "female")
    seg_speed = float(seg.get("speed", "1.0"))
    seg_duration_ms = int((seg.get("end", 0) - seg.get("start", 0)) * 1000)

    # Find actor config
    actor = next((a for a in actors if a.get("speaker") == speaker or a.get("id") == speaker), None)
    if actor:
        seg_gender = actor.get("gender", seg_gender)

    provider = actor.get("tts_provider", "edge") if actor else "edge"
    audio_seg = None

    # Try Gemini TTS
    if provider == "gemini" and GEMINI_TTS_API_KEY and actor and actor.get("gemini_voice"):
        mods = {
            "speed": actor.get("gemini_speed", "normal"),
            "pitch": actor.get("gemini_pitch", "normal"),
            "emotion": actor.get("gemini_emotion", "neutral"),
        }
        tags = []
        if mods["emotion"] != "neutral":
            tags.append(mods["emotion"])
        if seg_speed != 1.0:
            speed_label = "very slowly" if seg_speed <= 0.5 else "slowly" if seg_speed < 1.0 else "quickly" if seg_speed <= 1.5 else "very quickly"
            tags.append(f"speaking {speed_label}")
        elif mods["speed"] != "normal":
            tags.append(f"speaking {mods['speed']}")
        if mods["pitch"] != "normal":
            tags.append(f"{mods['pitch']} pitch")
        tagged_text = seg["translated"]
        if tags:
            tagged_text = f"[{', '.join(tags)}] {tagged_text}"
        try:
            audio_bytes = await synthesize_gemini_tts(text=tagged_text, voice_name=actor["gemini_voice"])
            audio_seg = AudioSegment.from_file(io.BytesIO(audio_bytes), format="wav")
        except Exception as e:
            logger.warning(f"Gemini TTS failed for segment {segment_idx}, falling back to Edge: {str(e)[:100]}")

    # Fallback to Edge TTS or MMS TTS or KLEA TTS
    if audio_seg is None:
        voice_id = actor.get("voice") if actor else None
        tts_path = os.path.join(tempfile.gettempdir(), f"regen_{uuid.uuid4().hex}")
        edge_rate = int((seg_speed - 1.0) * 100) + speed
        
        if is_mms_voice(voice_id):
            tts_path += ".wav"
            mms_speed = (seg_speed + (speed / 100.0)) * 0.9  # MMS base boost
            generate_mms_tts(seg["translated"], tts_path, speed=max(0.5, mms_speed), female=is_mms_female(voice_id))
            audio_seg = AudioSegment.from_file(tts_path)
        elif is_klea_voice(voice_id):
            tts_path += ".wav"
            generate_klea_tts(seg["translated"], tts_path)
            audio_seg = AudioSegment.from_file(tts_path)
        else:
            tts_path += ".mp3"
            edge_voice = get_edge_voice(target_lang, seg_gender, None if (is_mms_voice(voice_id) or is_klea_voice(voice_id)) else voice_id)
            communicate = edge_tts.Communicate(seg["translated"], voice=edge_voice, rate=f"+{edge_rate}%" if edge_rate >= 0 else f"{edge_rate}%")
            await communicate.save(tts_path)
            audio_seg = AudioSegment.from_file(tts_path)
        os.unlink(tts_path)

    if seg_duration_ms > 0:
        audio_seg = fit_audio_to_duration(audio_seg, seg_duration_ms)

    # Export and return as audio file
    buf = io.BytesIO()
    audio_seg.export(buf, format="mp3")
    buf.seek(0)

    # Save to segment's audio cache
    audio_filename = f"seg_audio_{project_id}_{segment_idx}_{uuid.uuid4().hex[:6]}.mp3"
    audio_path = os.path.join(str(LOCAL_STORAGE_DIR), audio_filename)
    with open(audio_path, "wb") as f:
        f.write(buf.getvalue())
    
    # Update segment with audio path
    segments[segment_idx]["audio_path"] = audio_filename
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {f"segments.{segment_idx}.audio_path": audio_filename, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    buf.seek(0)
    return StreamingResponse(buf, media_type="audio/mpeg", headers={"Content-Disposition": f"inline; filename={audio_filename}"})


@api_router.post("/projects/{project_id}/extract-background")
async def extract_background_endpoint(project_id: str, authorization: str = Header(None)):
    """Extract background audio (remove human voice, keep music/sfx) using Demucs AI. Runs in background."""
    user = await get_current_user(authorization)
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("file_type") != "video" or not project.get("original_file_path"):
        raise HTTPException(status_code=400, detail="No video file found")

    # If already extracted, return the file directly
    if project.get("bg_audio_path"):
        bg_path = os.path.join(str(LOCAL_STORAGE_DIR), project["bg_audio_path"])
        if os.path.exists(bg_path):
            with open(bg_path, "rb") as f:
                data = f.read()
            return StreamingResponse(
                io.BytesIO(data),
                media_type="audio/wav",
                headers={"Content-Disposition": f"attachment; filename={project['bg_audio_path']}"}
            )

    # Start background extraction
    import time as _time
    queue_status[project_id] = {"status": "processing", "step": "removing_vocals", "progress": 0, "total": 0, "started_at": _time.time()}
    
    async def _bg_extract():
        try:
            video_data, _ = get_object(project["original_file_path"])
            ext = project.get("original_filename", "video.mp4").split(".")[-1]
            tmp_video = os.path.join(tempfile.gettempdir(), f"extract_{uuid.uuid4().hex}.{ext}")
            with open(tmp_video, "wb") as f:
                f.write(video_data)
            
            bg_bytes = extract_background_audio(tmp_video, project_id=project_id)
            try: os.unlink(tmp_video)
            except: pass
            
            if bg_bytes:
                bg_filename = f"bg_audio_{project_id}_{uuid.uuid4().hex[:6]}.wav"
                bg_path = os.path.join(str(LOCAL_STORAGE_DIR), bg_filename)
                with open(bg_path, "wb") as f:
                    f.write(bg_bytes)
                await db.projects.update_one(
                    {"project_id": project_id},
                    {"$set": {"bg_audio_path": bg_filename, "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                queue_status[project_id] = {"status": "done", "step": "done", "bg_ready": True}
                logger.info(f"Background audio extraction complete: {bg_filename}")
            else:
                queue_status[project_id] = {"status": "error", "step": "error"}
        except Exception as e:
            logger.error(f"Background extraction error: {e}")
            queue_status[project_id] = {"status": "error", "step": "error"}
    
    asyncio.create_task(_bg_extract())
    return {"status": "processing", "message": "Extracting background audio. Removing human voice with AI..."}

@api_router.get("/projects/{project_id}/bg-audio")
async def get_bg_audio(project_id: str, authorization: str = Header(None)):
    """Download the extracted background audio file."""
    user = await get_current_user(authorization)
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
    if not project or not project.get("bg_audio_path"):
        raise HTTPException(status_code=404, detail="Background audio not ready")
    
    bg_path = os.path.join(str(LOCAL_STORAGE_DIR), project["bg_audio_path"])
    if not os.path.exists(bg_path):
        raise HTTPException(status_code=404, detail="Background audio file not found")
    
    with open(bg_path, "rb") as f:
        data = f.read()
    return StreamingResponse(
        io.BytesIO(data),
        media_type="audio/wav",
        headers={"Content-Disposition": f"attachment; filename={project['bg_audio_path']}"}
    )


@api_router.post("/projects/{project_id}/generate-audio-segments")
async def generate_audio_segments(project_id: str, speed: int = Query(2), bg_volume: int = Query(0), authorization: str = Header(None)):
    import time
    import io
    from pydub import AudioSegment

    user = await get_current_user(authorization)
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    segments = project.get("segments", [])
    if not segments:
        raise HTTPException(status_code=400, detail="No segments")

    # Run in background if: many segments OR Demucs needed (bg_volume > 0 adds ~2min)
    if len(segments) > 100 or (bg_volume > 0 and project.get("file_type") == "video"):
        asyncio.create_task(_generate_audio_background(project_id, project, segments, speed, user, bg_volume))
        return {"status": "processing", "message": f"Generating audio for {len(segments)} segments in background. Check progress bar."}

    return await _generate_audio_sync(project_id, project, segments, speed, user, bg_volume)

async def _generate_audio_background(project_id, project, segments, speed, user, bg_volume=0):
    """Background audio generation for long videos or when Demucs is needed."""
    try:
        await _generate_audio_sync(project_id, project, segments, speed, user, bg_volume)
        queue_status[project_id] = {"position": 0, "status": "done", "step": "done"}
    except Exception as e:
        logger.error(f"Background audio generation failed: {e}")
        queue_status[project_id] = {"position": 0, "status": "error", "step": "error"}
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": "error", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )

async def _generate_audio_sync(project_id, project, segments, speed, user, bg_volume=0):
    import io
    from pydub import AudioSegment
    import edge_tts

    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"status": "generating_audio", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    try:
        actors = project.get("actors", [])
        actor_voice_map = {a["id"]: a["custom_voice"] for a in actors if a.get("custom_voice")}
        actor_ai_voice_map = {a["id"]: a["voice"] for a in actors if a.get("voice")}
        target_lang = project.get("target_language", "km")

        total_duration_ms = get_media_duration_safe(project)
        has_timestamps = any(seg.get("start", 0) > 0 or seg.get("end", 0) > 0 for seg in segments)
        if not total_duration_ms and has_timestamps:
            last_end = max(seg.get("end", 0) for seg in segments)
            total_duration_ms = int((last_end + 2) * 1000)

        custom_pairs, tts_segments = separate_custom_and_tts_segments(segments, actor_voice_map)

        # Build actor provider map (edge vs gcloud vs gemini)
        actor_provider_map = {}
        actor_gcloud_voice_map = {}
        actor_gcloud_lang_map = {}
        actor_gemini_voice_map = {}
        actor_gemini_mods_map = {}
        for a in actors:
            actor_provider_map[a["id"]] = a.get("tts_provider", "edge")
            if a.get("gcloud_voice"):
                actor_gcloud_voice_map[a["id"]] = a["gcloud_voice"]
            if a.get("gcloud_language"):
                actor_gcloud_lang_map[a["id"]] = a["gcloud_language"]
            if a.get("gemini_voice"):
                actor_gemini_voice_map[a["id"]] = a["gemini_voice"]
            actor_gemini_mods_map[a["id"]] = {
                "speed": a.get("gemini_speed", "normal"),
                "pitch": a.get("gemini_pitch", "normal"),
                "emotion": a.get("gemini_emotion", "neutral"),
            }

        # Parallel TTS generation
        import edge_tts
        gemini_quota_exhausted = False
        
        async def generate_single_tts(seg):
            nonlocal gemini_quota_exhausted
            speaker = seg.get("speaker", "")
            seg_gender = seg.get("gender", "female")
            for a in actors:
                if a["id"] == speaker:
                    seg_gender = a.get("gender", seg_gender)
                    break

            provider = actor_provider_map.get(speaker, "edge")
            seg_duration_ms = int((seg.get("end", 0) - seg.get("start", 0)) * 1000)
            seg_speed = float(seg.get("speed", "1.0"))

            # Google Cloud TTS
            if provider == "gcloud" and GOOGLE_CLOUD_TTS_API_KEY and speaker in actor_gcloud_voice_map:
                gcloud_voice = actor_gcloud_voice_map[speaker]
                gcloud_lang = actor_gcloud_lang_map.get(speaker, target_lang)
                for attempt in range(3):
                    try:
                        audio_bytes = await synthesize_gcloud_tts(
                            text=seg["translated"],
                            voice_name=gcloud_voice,
                            language_code=gcloud_lang,
                            speaking_rate=1.0 + (speed / 100.0),
                        )
                        audio_seg = AudioSegment.from_file(io.BytesIO(audio_bytes), format="mp3")
                        if seg_duration_ms > 0:
                            audio_seg = fit_audio_to_duration(audio_seg, seg_duration_ms)
                        return (seg, audio_seg)
                    except Exception as e:
                        logger.warning(f"Google TTS attempt {attempt+1}/3 failed: {e}")
                        if attempt < 2:
                            await asyncio.sleep(1)
                logger.error(f"Google TTS failed after 3 attempts, falling back to Edge TTS")

            # Gemini TTS
            if provider == "gemini" and GEMINI_TTS_API_KEY and speaker in actor_gemini_voice_map and not gemini_quota_exhausted:
                gemini_voice = actor_gemini_voice_map[speaker]
                mods = actor_gemini_mods_map.get(speaker, {})
                # Build tagged text with voice mods
                tags = []
                if mods.get("emotion", "neutral") != "neutral":
                    tags.append(mods["emotion"])
                # Per-segment speed overrides actor speed
                if seg_speed != 1.0:
                    speed_label = "very slowly" if seg_speed <= 0.5 else "slowly" if seg_speed < 1.0 else "quickly" if seg_speed <= 1.5 else "very quickly"
                    tags.append(f"speaking {speed_label}")
                elif mods.get("speed", "normal") != "normal":
                    tags.append(f"speaking {mods['speed']}")
                if mods.get("pitch", "normal") != "normal":
                    tags.append(f"{mods['pitch']} pitch")
                tagged_text = seg["translated"]
                if tags:
                    tagged_text = f"[{', '.join(tags)}] {tagged_text}"
                for attempt in range(2):
                    try:
                        audio_bytes = await synthesize_gemini_tts(
                            text=tagged_text,
                            voice_name=gemini_voice,
                        )
                        audio_seg = AudioSegment.from_file(io.BytesIO(audio_bytes), format="wav")
                        if seg_duration_ms > 0:
                            audio_seg = fit_audio_to_duration(audio_seg, seg_duration_ms)
                        return (seg, audio_seg)
                    except Exception as e:
                        err_str = str(e)
                        logger.warning(f"Gemini TTS attempt {attempt+1}/2 failed: {err_str[:150]}")
                        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
                            if attempt == 0:
                                await asyncio.sleep(15)
                            else:
                                gemini_quota_exhausted = True
                                logger.warning("Gemini quota exhausted, switching all remaining to Edge TTS")
                        elif attempt < 1:
                            await asyncio.sleep(2)
                logger.error(f"Gemini TTS failed, falling back to Edge TTS")

            # Edge TTS or MMS TTS or KLEA TTS (default or fallback)
            voice_id = actor_ai_voice_map.get(speaker)
            
            if is_mms_voice(voice_id):
                # Meta MMS Khmer TTS
                tts_path = os.path.join(tempfile.gettempdir(), f"tts_{uuid.uuid4().hex}.wav")
                try:
                    mms_speed = (seg_speed + (speed / 100.0)) * 0.9  # MMS base boost
                    generate_mms_tts(seg["translated"], tts_path, speed=max(0.5, mms_speed), female=is_mms_female(voice_id))
                    audio_seg = AudioSegment.from_file(tts_path)
                    os.unlink(tts_path)
                    if seg_duration_ms > 0:
                        audio_seg = fit_audio_to_duration(audio_seg, seg_duration_ms)
                    return (seg, audio_seg)
                except Exception as e:
                    logger.warning(f"MMS TTS failed: {e}, falling back to Edge TTS")
                    if os.path.exists(tts_path):
                        try: os.unlink(tts_path)
                        except: pass
                    voice_id = None  # Reset so Edge TTS uses default voice
            
            if is_klea_voice(voice_id):
                # KLEA Khmer word-by-word TTS
                tts_path = os.path.join(tempfile.gettempdir(), f"tts_{uuid.uuid4().hex}.wav")
                try:
                    generate_klea_tts(seg["translated"], tts_path)
                    audio_seg = AudioSegment.from_file(tts_path)
                    os.unlink(tts_path)
                    if seg_duration_ms > 0:
                        audio_seg = fit_audio_to_duration(audio_seg, seg_duration_ms)
                    return (seg, audio_seg)
                except Exception as e:
                    logger.warning(f"KLEA TTS failed: {e}, falling back to Edge TTS")
                    if os.path.exists(tts_path):
                        try: os.unlink(tts_path)
                        except: pass
                    voice_id = None  # Reset so Edge TTS uses default voice
            
            # Edge TTS
            edge_voice = get_edge_voice(target_lang, seg_gender, voice_id)
            tts_path = os.path.join(tempfile.gettempdir(), f"tts_{uuid.uuid4().hex}.mp3")
            edge_rate = int((seg_speed - 1.0) * 100) + speed
            for attempt in range(3):
                try:
                    communicate = edge_tts.Communicate(seg["translated"], voice=edge_voice, rate=f"+{edge_rate}%" if edge_rate >= 0 else f"{edge_rate}%")
                    await communicate.save(tts_path)
                    audio_seg = AudioSegment.from_file(tts_path)
                    os.unlink(tts_path)
                    if seg_duration_ms > 0:
                        audio_seg = fit_audio_to_duration(audio_seg, seg_duration_ms)
                    return (seg, audio_seg)
                except Exception as e:
                    logger.warning(f"Edge TTS attempt {attempt+1}/3 failed: {e}")
                    if os.path.exists(tts_path):
                        try:
                            os.unlink(tts_path)
                        except OSError:
                            pass
                    if attempt < 2:
                        await asyncio.sleep(1)
            logger.error(f"Edge TTS failed after 3 attempts for segment {seg.get('id')}")
            return None

        tts_pairs = []
        import time as _time
        queue_status[project_id] = {"status": "processing", "step": "generating_audio", "progress": 0, "total": len(tts_segments), "started_at": _time.time()}
        
        # Check if any actor uses Gemini TTS
        has_gemini = any(actor_provider_map.get(seg.get("speaker"), "edge") == "gemini" for seg in tts_segments)
        
        if has_gemini:
            # Process one at a time with delay to avoid Gemini rate limits (10/min)
            for idx, seg in enumerate(tts_segments):
                result = await generate_single_tts(seg)
                if result is not None:
                    tts_pairs.append(result)
                queue_status[project_id]["progress"] = idx + 1
                logger.info(f"TTS segment {idx+1}/{len(tts_segments)} done")
                if idx < len(tts_segments) - 1 and actor_provider_map.get(seg.get("speaker"), "edge") == "gemini":
                    await asyncio.sleep(7)
        else:
            # Standard batch processing for Edge/Google Cloud
            for i in range(0, len(tts_segments), TTS_BATCH_SIZE):
                batch = tts_segments[i:i + TTS_BATCH_SIZE]
                results = await asyncio.gather(*[generate_single_tts(seg) for seg in batch])
                tts_pairs.extend([r for r in results if r is not None])
                queue_status[project_id]["progress"] = min(i + TTS_BATCH_SIZE, len(tts_segments))
                logger.info(f"TTS batch {i // TTS_BATCH_SIZE + 1}: {len([r for r in results if r])} generated ({queue_status[project_id]['progress']}/{len(tts_segments)})")

        # Combine custom + TTS, sort by segment order
        all_pairs = custom_pairs + tts_pairs
        segment_audio_pairs = sorted(all_pairs, key=lambda p: p[0].get("id", 0))

        if not segment_audio_pairs:
            raise Exception("No audio generated")

        combined = mix_audio_timeline(segment_audio_pairs, segments, total_duration_ms, has_timestamps)

        # Mix with background audio (original music/sfx) if video project and bg_volume > 0
        if bg_volume > 0 and project.get("file_type") == "video" and project.get("original_file_path"):
            try:
                logger.info(f"Extracting background audio (volume: {bg_volume}%)...")
                video_data, _ = get_object(project["original_file_path"])
                ext = project.get("original_filename", "video.mp4").split(".")[-1]
                tmp_video = os.path.join(tempfile.gettempdir(), f"bg_{uuid.uuid4().hex}.{ext}")
                with open(tmp_video, "wb") as f:
                    f.write(video_data)
                bg_bytes = extract_background_audio(tmp_video, project_id=project_id)
                os.unlink(tmp_video)
                if bg_bytes:
                    # Convert bg_volume (0-100%) to dB reduction
                    # 100% = 0dB (full), 50% = -10dB, 25% = -20dB, 10% = -30dB
                    import math
                    db_reduction = 0 if bg_volume >= 100 else int(-40 * (1 - bg_volume / 100))
                    logger.info(f"Mixing background at {bg_volume}% ({db_reduction}dB)...")
                    combined = mix_with_background(combined, bg_bytes, bg_volume=db_reduction)
                    logger.info("Background music mixed successfully")
            except Exception as e:
                logger.warning(f"Background audio extraction/mixing failed, continuing without: {e}")

        # Export as MP3 for long videos (WAV would be too large)
        output = io.BytesIO()
        if total_duration_ms > 300000:  # > 5 min → use MP3
            combined.export(output, format="mp3", bitrate="192k")
            audio_ext = "mp3"
            content_type = "audio/mpeg"
        else:
            combined.export(output, format="wav")
            audio_ext = "wav"
            content_type = "audio/wav"
        audio_bytes = output.getvalue()
        logger.info(f"Audio output: {len(audio_bytes) / 1024 / 1024:.1f}MB ({audio_ext})")

        path = f"{APP_NAME}/audio/{user.user_id}/{project_id}/dubbed_{uuid.uuid4().hex}.{audio_ext}"
        result = put_object(path, audio_bytes, content_type)
        
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

# Extract audio from YouTube URL
class YoutubeExtractRequest(BaseModel):
    url: str
    actor_id: str = ""

def download_youtube_audio(url: str) -> tuple:
    """Download audio from YouTube URL. Returns (mp3_path, title, duration)."""
    import yt_dlp
    output_path = os.path.join(tempfile.gettempdir(), f"yt_{uuid.uuid4().hex}")
    ydl_opts = {
        'outtmpl': f'{output_path}.%(ext)s',
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
        'socket_timeout': 30,
        'js_runtimes': {'node': {}},
        'remote_components': {'ejs:github': {}},
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
    mp3_path = f"{output_path}.mp3"
    if not os.path.exists(mp3_path):
        raise FileNotFoundError("Audio extraction failed")
    return mp3_path, info.get('title', 'YouTube Audio'), info.get('duration', 0), output_path

def save_youtube_voice_to_actor(project_id: str, audio_data: bytes, actors: list, actor_id: str) -> str:
    """Save YouTube audio to storage and optionally assign to an actor."""
    storage_path = f"voxidub/{project_id}/yt_voice_{uuid.uuid4().hex[:8]}.mp3"
    put_object(storage_path, audio_data, "audio/mpeg")
    return storage_path

@api_router.post("/projects/{project_id}/youtube-voice")
async def extract_youtube_voice(project_id: str, req: YoutubeExtractRequest, authorization: str = Header(None)):
    import yt_dlp
    user = await get_current_user(authorization)
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    output_path = None
    try:
        mp3_path, title, duration, output_path = download_youtube_audio(req.url)
        with open(mp3_path, "rb") as f:
            audio_data = f.read()
        os.unlink(mp3_path)

        storage_path = save_youtube_voice_to_actor(project_id, audio_data, project.get("actors", []), req.actor_id)

        if req.actor_id:
            actors = project.get("actors", [])
            for a in actors:
                if a["id"] == req.actor_id:
                    a["custom_voice"] = storage_path
                    break
            await db.projects.update_one(
                {"project_id": project_id},
                {"$set": {"actors": actors, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )

        return {
            "path": storage_path,
            "title": title,
            "duration": duration,
            "size": len(audio_data),
            "actor_id": req.actor_id,
        }
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(status_code=400, detail=f"Cannot download: {str(e)[:100]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if output_path:
            for ext in ['.mp3', '.m4a', '.webm', '.opus', '.wav']:
                p = f"{output_path}{ext}"
                if os.path.exists(p):
                    try:
                        os.unlink(p)
                    except OSError:
                        pass


def assemble_dubbed_video(project: dict, burn_subs: bool) -> bytes:
    """Assemble the final dubbed video from original video + dubbed audio.
    Returns the output video bytes."""
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
        if burn_subs and segments:
            srt_content = generate_srt(segments)
            srt_path = os.path.join(temp_dir, "subtitles.srt")
            with open(srt_path, "w", encoding="utf-8") as f:
                f.write(srt_content)
            burn_subtitles_into_video(video_path, srt_path, audio_path, output_path)
        else:
            merge_audio_with_video(video_path, audio_path, output_path)

        with open(output_path, "rb") as f:
            return f.read()

# Generate video with optional burned-in subtitles
@api_router.post("/projects/{project_id}/generate-video")
async def generate_video(project_id: str, burn_subtitles: bool = Query(False), authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
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
        output_data = assemble_dubbed_video(project, burn_subtitles)
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
    await get_current_user(authorization)
    target_name = LANGUAGE_NAMES.get(request.target_language, request.target_language)
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"quick_translate_{uuid.uuid4().hex[:8]}",
        system_message=f"You are a professional translator. Translate to {target_name}. Only output the {target_name} translation."
    )
    chat.with_model("openai", "gpt-5.2")
    translated = await chat.send_message(UserMessage(text=request.chinese_text))
    return {"original": request.chinese_text, "translated": translated}

# Download SRT subtitle file
@api_router.get("/projects/{project_id}/download-srt")
async def download_srt(project_id: str, authorization: str = Header(None)):
    user = await get_current_user(authorization)
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
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
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
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
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
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
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
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
    project = strip_oid(await db.projects.find_one({"share_token": share_token}))
    if not project or not project.get("dubbed_video_path"):
        raise HTTPException(status_code=404, detail="Not found")
    data, content_type = get_object(project["dubbed_video_path"])
    return Response(content=data, media_type=content_type)

@api_router.get("/shared/{share_token}/audio")
async def get_shared_audio(share_token: str):
    project = strip_oid(await db.projects.find_one({"share_token": share_token}))
    if not project or not project.get("dubbed_audio_path"):
        raise HTTPException(status_code=404, detail="Not found")
    data, content_type = get_object(project["dubbed_audio_path"])
    return Response(content=data, media_type=content_type)

@api_router.get("/shared/{share_token}/srt")
async def get_shared_srt(share_token: str):
    project = strip_oid(await db.projects.find_one({"share_token": share_token}))
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
    qs = queue_status.get(project_id, {})
    import time
    elapsed = time.time() - qs.get("started_at", time.time()) if qs.get("started_at") else 0
    progress = qs.get("progress", 0)
    total = qs.get("total", 0)
    eta = 0
    if progress > 0 and total > 0:
        per_item = elapsed / progress
        eta = per_item * (total - progress)
    return {
        "project_id": project_id,
        "status": project.get("status", "created"),
        "queue_status": qs.get("status", "idle"),
        "step": qs.get("step", ""),
        "progress": progress,
        "total": total,
        "elapsed": round(elapsed, 1),
        "eta": round(eta, 1),
        "demucs_chunks": qs.get("demucs_chunks", 0),
        "demucs_duration": qs.get("demucs_duration", 0),
    }

# ===== Google Cloud TTS Integration =====

# Cache voices for 1 hour
_gcloud_voices_cache = {"data": None, "expires": 0}

@api_router.get("/gcloud-voices")
async def list_gcloud_voices(language_code: str = Query(None)):
    """List available Google Cloud TTS voices, optionally filtered by language."""
    import time as _time
    if not GOOGLE_CLOUD_TTS_API_KEY:
        raise HTTPException(status_code=400, detail="Google Cloud TTS not configured")

    now = _time.time()
    if _gcloud_voices_cache["data"] and now < _gcloud_voices_cache["expires"]:
        all_voices = _gcloud_voices_cache["data"]
    else:
        params = {"key": GOOGLE_CLOUD_TTS_API_KEY}
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(GOOGLE_TTS_VOICES_URL, params=params)
            if r.status_code != 200:
                raise HTTPException(status_code=r.status_code, detail="Google Cloud API error")
            all_voices = r.json().get("voices", [])
            _gcloud_voices_cache["data"] = all_voices
            _gcloud_voices_cache["expires"] = now + 3600

    if language_code:
        all_voices = [v for v in all_voices if any(lc.startswith(language_code) for lc in v.get("languageCodes", []))]

    simplified = []
    for v in all_voices:
        simplified.append({
            "name": v["name"],
            "language": v["languageCodes"][0] if v.get("languageCodes") else "",
            "gender": v.get("ssmlGender", "NEUTRAL"),
            "sample_rate": v.get("naturalSampleRateHertz", 24000),
        })
    return {"voices": simplified, "total": len(simplified)}

class GCloudTTSRequest(BaseModel):
    text: str
    voice_name: str
    language_code: str
    speaking_rate: float = 1.0
    pitch: float = 0.0

@api_router.post("/gcloud-tts-preview")
async def preview_gcloud_tts(req: GCloudTTSRequest):
    """Preview a Google Cloud TTS voice (returns MP3 audio)."""
    import base64
    if not GOOGLE_CLOUD_TTS_API_KEY:
        raise HTTPException(status_code=400, detail="Google Cloud TTS not configured")

    payload = {
        "input": {"text": req.text},
        "voice": {"languageCode": req.language_code, "name": req.voice_name},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": req.speaking_rate, "pitch": req.pitch},
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{GOOGLE_TTS_SYNTHESIZE_URL}?key={GOOGLE_CLOUD_TTS_API_KEY}", json=payload)
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail=r.json().get("error", {}).get("message", "TTS failed"))
        audio_bytes = base64.b64decode(r.json()["audioContent"])
    return Response(content=audio_bytes, media_type="audio/mpeg")

async def synthesize_gcloud_tts(text: str, voice_name: str, language_code: str, speaking_rate: float = 1.0, pitch: float = 0.0) -> bytes:
    """Synthesize speech using Google Cloud TTS. Returns MP3 bytes."""
    import base64
    payload = {
        "input": {"text": text},
        "voice": {"languageCode": language_code, "name": voice_name},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": speaking_rate, "pitch": pitch},
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{GOOGLE_TTS_SYNTHESIZE_URL}?key={GOOGLE_CLOUD_TTS_API_KEY}", json=payload)
        if r.status_code != 200:
            raise Exception(f"Google TTS failed: {r.text[:200]}")
        return base64.b64decode(r.json()["audioContent"])


# ===== Gemini TTS Integration =====

GEMINI_TTS_VOICES = [
    {"name": "Aoede", "gender": "FEMALE", "style": "Bright"},
    {"name": "Charon", "gender": "MALE", "style": "Informative"},
    {"name": "Fenrir", "gender": "MALE", "style": "Excitable"},
    {"name": "Kore", "gender": "FEMALE", "style": "Firm"},
    {"name": "Puck", "gender": "MALE", "style": "Upbeat"},
    {"name": "Leda", "gender": "FEMALE", "style": "Youthful"},
    {"name": "Orus", "gender": "MALE", "style": "Firm"},
    {"name": "Zephyr", "gender": "MALE", "style": "Breeze"},
    {"name": "Achernar", "gender": "FEMALE", "style": "Soft"},
    {"name": "Gacrux", "gender": "MALE", "style": "Mature"},
    {"name": "Pulcherrima", "gender": "FEMALE", "style": "Forward"},
    {"name": "Vindemiatrix", "gender": "FEMALE", "style": "Gentle"},
    {"name": "Sadachbia", "gender": "MALE", "style": "Lively"},
    {"name": "Sadaltager", "gender": "MALE", "style": "Knowledgeable"},
    {"name": "Sulafat", "gender": "FEMALE", "style": "Warm"},
    {"name": "Achird", "gender": "MALE", "style": "Friendly"},
    {"name": "Zubenelgenubi", "gender": "MALE", "style": "Casual"},
    {"name": "Schedar", "gender": "FEMALE", "style": "Even"},
    {"name": "Callirrhoe", "gender": "FEMALE", "style": "Easy-going"},
    {"name": "Despina", "gender": "FEMALE", "style": "Smooth"},
    {"name": "Erinome", "gender": "FEMALE", "style": "Clear"},
    {"name": "Algenib", "gender": "MALE", "style": "Gravelly"},
    {"name": "Rasalgethi", "gender": "MALE", "style": "Informative"},
    {"name": "Umbriel", "gender": "MALE", "style": "Easy-going"},
    {"name": "Alnilam", "gender": "MALE", "style": "Firm"},
    {"name": "Algieba", "gender": "MALE", "style": "Smooth"},
    {"name": "Dione", "gender": "FEMALE", "style": "Confident"},
    {"name": "Elara", "gender": "FEMALE", "style": "Soft"},
    {"name": "Isonoe", "gender": "FEMALE", "style": "Hypnotic"},
    {"name": "Autonoe", "gender": "FEMALE", "style": "Bright"},
]

@api_router.get("/gemini-voices")
async def list_gemini_voices():
    """List available Gemini TTS voices."""
    if not GEMINI_TTS_API_KEY:
        raise HTTPException(status_code=400, detail="Gemini TTS not configured")
    return {"voices": GEMINI_TTS_VOICES, "total": len(GEMINI_TTS_VOICES)}

@api_router.post("/gemini-tts-preview")
async def preview_gemini_tts(req: GCloudTTSRequest):
    """Preview a Gemini TTS voice (returns WAV audio)."""
    if not GEMINI_TTS_API_KEY:
        raise HTTPException(status_code=400, detail="Gemini TTS not configured")
    try:
        audio_bytes = await synthesize_gemini_tts(req.text, req.voice_name)
        return Response(content=audio_bytes, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:200])

async def synthesize_gemini_tts(text: str, voice_name: str) -> bytes:
    """Synthesize speech using Gemini TTS. Returns WAV bytes."""
    import wave, io
    from google import genai
    from google.genai import types as gtypes

    client = genai.Client(api_key=GEMINI_TTS_API_KEY)
    response = client.models.generate_content(
        model='gemini-2.5-flash-preview-tts',
        contents=text,
        config=gtypes.GenerateContentConfig(
            response_modalities=['AUDIO'],
            speech_config=gtypes.SpeechConfig(
                voice_config=gtypes.VoiceConfig(
                    prebuilt_voice_config=gtypes.PrebuiltVoiceConfig(
                        voice_name=voice_name,
                    )
                )
            ),
        ),
    )
    if not response.candidates or not response.candidates[0].content or not response.candidates[0].content.parts:
        raise Exception("Gemini TTS returned empty response")
    pcm_data = response.candidates[0].content.parts[0].inline_data.data
    # Convert PCM to WAV
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(pcm_data)
    return buf.getvalue()




# Auto-process: transcribe + translate + generate audio in one call
@api_router.post("/projects/{project_id}/auto-process")
async def auto_process(project_id: str, speed: int = Query(2), target_language: str = Query("km"), bg_volume: int = Query(0), authorization: str = Header(None)):
    from emergentintegrations.llm.openai import OpenAISpeechToText
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    user = await get_current_user(authorization)
    project = strip_oid(await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.get("original_file_path"):
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    import time as _time
    queue_status[project_id] = {"position": 0, "status": "processing", "step": "starting", "progress": 0, "total": 3, "started_at": _time.time()}
    
    auth_header = f"Bearer {authorization.split('Bearer ')[-1] if 'Bearer ' in (authorization or '') else authorization}"
    
    async def _auto_process_background():
        nonlocal project
        try:
            # Step 1: Transcribe (if not done)
            if project.get("status") in ["created", "uploaded"]:
                queue_status[project_id].update({"step": "transcribing", "progress": 0, "total": 3})
                await db.projects.update_one(
                    {"project_id": project_id},
                    {"$set": {"status": "transcribing", "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                await transcribe_segments(project_id, authorization=auth_header)
                project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
            
            # Step 2: Translate (if not done)
            if project.get("status") == "transcribed":
                queue_status[project_id].update({"step": "translating", "progress": 1, "total": 3})
                await translate_segments(project_id, target_language=target_language, authorization=auth_header)
                project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
            
            # Step 3: Generate audio (if not done)
            if project.get("status") == "translated":
                queue_status[project_id].update({"step": "generating_audio", "progress": 2, "total": 3})
                segments = project.get("segments", [])
                await _generate_audio_sync(project_id, project, segments, speed, user, bg_volume)
                project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
            
            queue_status[project_id] = {"position": 0, "status": "done", "step": "done"}
            
        except Exception as e:
            queue_status[project_id] = {"position": 0, "status": "error", "step": "error"}
            logger.error(f"Auto-process error: {e}")
            await db.projects.update_one(
                {"project_id": project_id},
                {"$set": {"status": "error", "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
    
    asyncio.create_task(_auto_process_background())
    return {"status": "processing", "message": "Auto-processing started. Detecting speakers, translating, generating audio..."}

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Serve frontend build in production (Railway/Docker)
FRONTEND_BUILD = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "build")
if os.path.isdir(FRONTEND_BUILD):
    from starlette.staticfiles import StaticFiles
    from starlette.responses import FileResponse

    @app.get("/shared/{path:path}")
    async def serve_shared_page(path: str):
        return FileResponse(os.path.join(FRONTEND_BUILD, "index.html"))

    @app.get("/dashboard")
    @app.get("/editor/{path:path}")
    async def serve_spa_routes(path: str = ""):
        return FileResponse(os.path.join(FRONTEND_BUILD, "index.html"))

    app.mount("/", StaticFiles(directory=FRONTEND_BUILD, html=True), name="frontend")

@app.on_event("startup")
async def startup():
    logger.info("Storage initialized (local)")
    # Preload SpeechBrain model in background to speed up first use
    asyncio.get_event_loop().run_in_executor(None, get_speaker_classifier)
    # Start auto-cleanup background task
    asyncio.create_task(auto_cleanup_old_projects())


async def auto_cleanup_old_projects():
    """Delete all projects older than 12 hours (trial users). Runs every 1 hour."""
    CLEANUP_INTERVAL_HOURS = 1
    PROJECT_MAX_AGE_HOURS = 12
    while True:
        try:
            await asyncio.sleep(CLEANUP_INTERVAL_HOURS * 3600)
            cutoff = datetime.now(timezone.utc) - timedelta(hours=PROJECT_MAX_AGE_HOURS)
            cutoff_str = cutoff.isoformat()

            old_projects = await db.projects.find(
                {"created_at": {"$lt": cutoff_str}},
                {"_id": 0, "project_id": 1, "user_id": 1, "title": 1, "original_file_path": 1, "dubbed_audio_path": 1, "dubbed_video_path": 1}
            ).to_list(length=500)

            deleted_count = 0
            # Clean up files first
            for project in old_projects:
                for key in ["original_file_path", "dubbed_audio_path", "dubbed_video_path"]:
                    file_path = project.get(key)
                    if file_path:
                        try:
                            delete_object(file_path)
                        except Exception:
                            pass
                deleted_count += 1

            # Bulk delete from DB
            if old_projects:
                project_ids = [p["project_id"] for p in old_projects]
                await db.projects.delete_many({"project_id": {"$in": project_ids}})

            if deleted_count > 0:
                logger.info(f"Auto-cleanup: deleted {deleted_count} projects older than {PROJECT_MAX_AGE_HOURS} hours")
        except Exception as e:
            logger.error(f"Auto-cleanup error: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
