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
- [x] Code quality refactor (extracted helpers, sessionStorage, named constants, no hardcoded secrets)
- [x] YouTube voice extraction via yt-dlp (with Node.js JS runtime)
- [x] Auto-fit audio (FFmpeg atempo) for both TTS and custom uploaded voices
- [x] 12-hour auto-cleanup for trial user storage
- [x] Deployment files (Dockerfile, railway.toml)

## Code Architecture (Post-Refactor)
- **Backend helpers**: `merge_whisper_segments()`, `build_actors_from_segments()`, `apply_speaker_detections()`, `apply_fallback_speakers()`, `get_media_duration_safe()`, `separate_custom_and_tts_segments()`, `mix_audio_timeline()`, `fit_audio_to_duration()`
- **Constants**: `TTS_BATCH_SIZE`, `TRANSLATE_CHUNK_SIZE`, `POLL_INTERVAL_S`
- **Auth tokens**: sessionStorage (not localStorage)
- **Test files**: Use env vars via conftest.py fixtures
- **yt-dlp config**: js_runtimes={'node': {}}, remote_components={'ejs:github': {}}

## Backlog
### P1
- [ ] Split App.js into component files (Editor, Player, ActorCard, ProjectList)

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
