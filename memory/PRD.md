# Khmer Dubbing App - Product Requirements Document

## Original Problem Statement
Build Dubbing China to Khmer using python website following top trending design.

## Supported Output Languages (20 - All Free Edge TTS)
Khmer, Thai, Vietnamese, Korean, Japanese, English, Chinese, Indonesian, Hindi, Spanish, French, Filipino, German, Portuguese, Russian, Arabic, Italian, Malay, Lao, Burmese

## What's Been Implemented
- [x] Google OAuth login, Project CRUD, upload
- [x] Whisper transcription (auto-detect language)
- [x] GPT-5.2 translation to ANY of 20 languages
- [x] Edge TTS voices (male+female per language, free, original voice - no pitch)
- [x] Per-actor voice, custom voice upload + recording
- [x] Video dubbing, SRT, MP3, batch export, share link
- [x] Parallel TTS (5 at a time), auto-process, queue
- [x] Swiss Light/Dark Theme UI
- [x] Compact actor cards with Boy/Girl distinction
- [x] Chunked translation (50 segments per batch for long videos)
- [x] Real-time progress bar (segments done, %, elapsed, ETA)
- [x] Output language selector (20 languages in dropdown)
- [x] YouTube voice extraction via yt-dlp (with Node.js JS runtime)
- [x] Auto-fit audio (FFmpeg atempo) for both TTS and custom uploaded voices
- [x] 12-hour auto-cleanup for trial user storage
- [x] Delete project with full file cleanup (videos, audio, custom voices)
- [x] Clear All projects button with confirmation dialog
- [x] Long video support: background processing, MP3 output, FFmpeg atempo, TTS retry
- [x] Deployment files (Dockerfile, railway.toml)
- [x] Code refactoring: App.js split into 6 components (44 lines from 1784)
- [x] Backend refactoring: extracted 10+ helper functions from large handlers
- [x] Security fix: removed hardcoded test secret
- [x] Fixed empty catch block, dynamic import

## Code Architecture (Post-Refactor)

### Frontend Components
- `App.js` (44 lines) - Router only
- `AuthContext.jsx` - Auth provider, theme toggle, callback, protected route
- `LandingPage.jsx` - Landing page with features grid
- `Dashboard.jsx` - Project list with CRUD, Clear All
- `Editor.jsx` - Main editor with all dubbing features
- `SharedProject.jsx` - Public shared project view
- `EditorWidgets.jsx` - StepProgress, ProcessingOverlay
- `constants.js` - API URL, timeouts, OUTPUT_LANGUAGES config

### Backend Helpers
- `download_youtube_audio()` - YouTube audio extraction
- `save_youtube_voice_to_actor()` - Storage & actor assignment
- `assemble_dubbed_video()` - Video assembly with optional subtitles
- `merge_whisper_segments()` - Merge short Whisper segments
- `build_actors_from_segments()` - Actor list from speaker detection
- `apply_speaker_detections()` / `apply_fallback_speakers()` - Speaker assignment
- `separate_custom_and_tts_segments()` - Split custom vs TTS audio
- `mix_audio_timeline()` - Timeline-aligned audio mixing
- `fit_audio_to_duration()` - Auto-speed audio to fit segment time

### Routes
- `/` - Landing page
- `/dashboard` - Project list (protected)
- `/editor/:projectId` - Editor (protected)
- `/shared/:shareToken` - Public shared view

## Backlog
### P1
- (Completed) Split App.js into component files

### P2
- [ ] Voice Library (browse & preview voices)
- [ ] AI voice cloning
- [ ] Auto lip sync
- [ ] Drag to adjust timing
- [ ] Export different video quality
- [ ] Mobile friendly layout

### P3
- [ ] Team workspace
- [ ] Multi-language UI
- [ ] Waveform timeline
