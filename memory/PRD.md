# Khmer Dubbing Hub - Product Requirements Document

## Problem Statement
Build a video/audio dubbing platform (China to Khmer and multi-language) with AI-powered transcription, translation, TTS voices, and subtitle editing.

## Core Requirements
- Video/Audio upload with Whisper transcription
- Multi-language translation via GPT-5.2
- Multiple TTS providers: Microsoft Edge TTS (free), Gemini TTS (free)
- Subtitle/segment editor with per-line controls
- Custom voice upload per detected actor
- Fast parallel processing for long videos (1h+)
- Background music preservation in dubbed output

## Architecture
- Frontend: React (modularized components)
- Backend: FastAPI (Python)
- Database: MongoDB
- Storage: Local file storage (/app/uploads)
- Auth: Emergent Google OAuth

## Components
- LandingPage.jsx - Marketing/auth entry
- Dashboard.jsx - Project listing
- Editor.jsx - Main editor with segments, actors, voice controls
- VoicePickerModal.jsx - Voice selection (Edge + Gemini tabs)
- EditorWidgets.jsx - Reusable editor UI pieces
- SharedProject.jsx - Public sharing view
- AuthContext.jsx - Auth state management

## Completed Features
- [x] Video/audio upload and processing
- [x] Whisper transcription (via Emergent LLM key)
- [x] GPT-5.2 translation (via Emergent LLM key)
- [x] Microsoft Edge TTS (free, unlimited)
- [x] Gemini TTS integration (free tier, rate-limited)
- [x] Google Cloud TTS integration (removed from UI per user request, backend still available)
- [x] Custom voice upload (file + YouTube yt-dlp extraction)
- [x] Long video processing (1h+, MP3 format, 15min timeouts)
- [x] Component refactoring (App.js split into 6 modules)
- [x] Auto-cleanup job (12h project expiry)
- [x] Clear All Projects functionality
- [x] Deployment-ready configs (Dockerfile, railway.toml)
- [x] Voice Mod controls for Gemini (Speed, Pitch, Emotion per actor)
- [x] Per-line speed control (0.5x to 2.0x)
- [x] Speaker reassignment dropdown per line
- [x] Actor line filter (click line count to filter segments)
- [x] Background music preservation (extract + mix with dubbed audio)
- [x] Cross-origin Script error suppression
- [x] Gemini TTS rate limit handling (sequential + exponential backoff)
- [x] Bulk DB cleanup optimization (delete_many)
- [x] Deployment health check passed

## Upcoming Tasks (P0)
- [ ] Stripe payment integration (Free/Basic/Pro/Business)
- [ ] Usage limits per plan (credits, video counts)

## Future Tasks
- [ ] AI voice cloning & auto lip sync (P1)
- [ ] Mobile-friendly layout (P2)
- [ ] Export different video quality (P2)
- [ ] Team workspace (P3)
- [ ] Multi-language UI (P3)
- [ ] Waveform timeline (P3)

## 3rd Party Integrations
- OpenAI GPT-5.2 (Translation) - Emergent LLM Key
- OpenAI Whisper (Transcription) - Emergent LLM Key
- Microsoft Edge TTS - Free / No Key
- Google Gemini TTS (google-genai) - User API Key in .env
- YouTube (yt-dlp) - Free / No Key

## Known Issues
- FFmpeg missing on container restart (reinstall via apt-get)
- Gemini TTS rate limits on free tier (10 req/min) - mitigated with sequential processing

## DB Schema
- projects: {project_id, user_id, title, target_language, status, segments[], actors[], file_type, original_file_path, dubbed_audio_path, dubbed_video_path, created_at}
- users: {user_id, email, name, picture, created_at}
- user_sessions: {session_token, user_id, expires_at, created_at}
