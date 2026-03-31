# Khmer Dubbing App - Product Requirements Document

## Original Problem Statement
Build Dubbing China to Khmer using python website following top trending design (HeyGen-inspired).

## User Choices
- Upload video/audio -> Get dubbed output in ANY of 20 languages
- Auto-transcribe using OpenAI Whisper (auto-detect language)
- Translation using OpenAI GPT-5.2 (any language to any language)
- TTS using Microsoft Edge TTS (free native voices for 20 languages)
- Google social login (Emergent-managed)
- Output: MP4 video, WAV audio, MP3 audio, SRT subtitles

## Design
- **Theme**: Swiss & High-Contrast with Dark Mode support
- **Actor cards**: White bg with blue/pink left-border (Boy/Girl)
- **Frontend**: React 19, Tailwind CSS (darkMode: class), Phosphor Icons, Framer Motion
- **Backend**: FastAPI, MongoDB, Python

## Supported Output Languages (20 - All Free Edge TTS)
Khmer, Thai, Vietnamese, Korean, Japanese, English, Chinese, Indonesian, Hindi, Spanish, French, Filipino, German, Portuguese, Russian, Arabic, Italian, Malay, Lao, Burmese

## What's Been Implemented

### Core Features
- [x] Google OAuth login
- [x] Project CRUD, upload, transcription (Whisper), translation (GPT-5.2)
- [x] Multi-language output (20 languages with free Edge TTS voices)
- [x] Per-actor voice selection, pitch control, age detection
- [x] Custom voice upload + recording per actor/segment
- [x] Video dubbing, subtitle editor, share via public link
- [x] Download SRT, MP3, batch export
- [x] Parallel TTS, auto-process, queue system
- [x] Swiss Light/Dark Theme UI
- [x] Compact actor cards with strong Boy/Girl distinction

## Key Technical Notes
- DO NOT re-add SSML/Emotion TTS features - user explicitly removed them
- Edge TTS voice map: EDGE_TTS_VOICES dict in server.py
- get_edge_voice(lang_code, gender, voice_id) helper for voice lookup
- target_language stored in project doc, defaults to "km"
- /api/languages endpoint (no auth) returns all 20 languages with voices

## Prioritized Backlog
### P2
- [ ] AI voice cloning
- [ ] Auto lip sync
- [ ] Drag to adjust timing
- [ ] Export different video quality
- [ ] Mobile friendly layout

### P3
- [ ] Team workspace
- [ ] Multi-language UI (website interface translation)
- [ ] Waveform timeline
