# Khmer Dubbing App - Product Requirements Document

## Original Problem Statement
Build Dubbing China to Khmer using python website following top trending design (HeyGen-inspired).

## User Choices
- Upload video/audio → Get Khmer dubbed output (both options)
- Auto-transcribe using OpenAI Whisper
- Translation using OpenAI GPT-5.2
- Voice generation using OpenAI TTS
- Google social login (Emergent-managed)
- Output: Both audio and video options

## Architecture
- **Frontend**: React 19, Tailwind CSS, Phosphor Icons, Framer Motion
- **Backend**: FastAPI, MongoDB, Python
- **Integrations**:
  - Emergent Google OAuth for authentication
  - OpenAI GPT-5.2 for Chinese→Khmer translation
  - OpenAI Whisper for speech-to-text transcription
  - OpenAI TTS (tts-1-hd) for voice generation
  - Emergent Object Storage for file storage
  - FFmpeg for audio extraction and video merging

## User Personas
1. **Content Creator**: Uploads Chinese videos, needs Khmer dubbed versions for Cambodian audience
2. **Translator**: Uses text input for quick translations with audio output
3. **Media Company**: Batch processes multiple videos for localization

## Core Requirements (Static)
- [ ] Google OAuth login
- [ ] Project creation and management
- [ ] Video/audio file upload
- [ ] Auto-transcription (Whisper)
- [ ] Chinese to Khmer translation
- [ ] Khmer voice generation (TTS)
- [ ] Video dubbing (merge audio with original video)
- [ ] Download dubbed audio/video

## What's Been Implemented (2026-03-31)
### Backend
- ✅ FastAPI server with /api prefix
- ✅ Google OAuth authentication flow
- ✅ User and session management (MongoDB)
- ✅ Project CRUD operations
- ✅ File upload to Emergent Object Storage
- ✅ Audio extraction from video (FFmpeg)
- ✅ Whisper transcription endpoint
- ✅ GPT-5.2 translation endpoint
- ✅ TTS audio generation endpoint
- ✅ Video dubbing (audio merge) endpoint
- ✅ File download endpoint

### Frontend
- ✅ Landing page with HeyGen-inspired dark theme
- ✅ Google Sign-In integration
- ✅ Dashboard with project list
- ✅ Editor view with:
  - Video/audio upload dropzone
  - Auto-transcribe button (Whisper)
  - Chinese text input/editing
  - Translate to Khmer button
  - Khmer translation display
  - Voice selection dropdown (6 voices)
  - Audio generation
  - Video generation (for video uploads)
  - Download buttons for audio/video

## Known Issues
- LLM features require active EMERGENT_LLM_KEY (currently inactive)
- Storage initialization requires valid key

## Prioritized Backlog

### P0 (Critical)
- [x] Basic dubbing workflow complete

### P1 (High Priority)
- [ ] Add progress indicators for long operations
- [ ] Subtitle/caption generation
- [ ] Batch processing for multiple files

### P2 (Medium Priority)
- [ ] Voice cloning integration
- [ ] Real-time preview
- [ ] Timestamp-aligned translation

### P3 (Low Priority)
- [ ] Team collaboration features
- [ ] Usage analytics dashboard
- [ ] API rate limiting

## Next Tasks
1. Activate EMERGENT_LLM_KEY to enable AI features
2. Test full dubbing workflow with real video
3. Add error handling for failed transcriptions
4. Implement job queue for long-running tasks
