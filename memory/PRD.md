# Khmer Dubbing App - Product Requirements Document

## Original Problem Statement
Build Dubbing China to Khmer using python website following top trending design (HeyGen-inspired).

## User Choices
- Upload video/audio -> Get Khmer dubbed output
- Auto-transcribe using OpenAI Whisper (auto-detect language)
- Translation using OpenAI GPT-5.2 (any language to Khmer)
- Khmer TTS using Microsoft Edge TTS (free, native Khmer voices)
- Google social login (Emergent-managed)
- Output: MP4 video, WAV audio, MP3 audio, SRT subtitles
- Auto-detect actors (Boy/Girl) and upload custom voice per actor
- Share dubbed project via public link

## Design
- **Theme**: Swiss & High-Contrast (Light theme)
- **Fonts**: Outfit (headings), IBM Plex Sans (body), JetBrains Mono (code/timestamps)
- **Colors**: White backgrounds, zinc-950 text, emerald accents for success, sharp corners (rounded-sm)
- **Actor cards**: Blue gradient (Boy), Pink gradient (Girl) with thick colored borders
- **Frontend**: React 19, Tailwind CSS, Phosphor Icons, Framer Motion
- **Backend**: FastAPI, MongoDB, Python
- **Integrations**:
  - Emergent Google OAuth for authentication
  - OpenAI GPT-5.2 for translation (via Emergent LLM Key)
  - OpenAI Whisper for speech-to-text with auto language detection (via Emergent LLM Key)
  - Microsoft Edge TTS for real Khmer voices (free, no key needed)
  - FFmpeg for audio extraction, video merging, MP3 conversion

## What's Been Implemented

### Round 0 (Core)
- [x] Google OAuth login
- [x] Project creation and management (CRUD)
- [x] Video/audio file upload
- [x] Auto-transcription (Whisper) with speaker detection via GPT
- [x] Any language to Khmer translation (GPT-5.2)
- [x] Khmer voice generation (Edge TTS)
- [x] Video dubbing (merge audio with original video)
- [x] Actor-level custom voice mapping
- [x] Per-segment custom voice upload
- [x] Subtitle editor with timestamps
- [x] Built-in voice recorder
- [x] Original video preview + side-by-side compare
- [x] TTS speed slider (-10% to +15%)
- [x] Single-line audio preview
- [x] Download Script (.txt) per actor (paged)

### Round 1 (Export & Sharing)
- [x] Auto-detect language (Chinese, Thai, Korean, Vietnamese, etc.)
- [x] Download SRT subtitle file
- [x] Export audio as MP3
- [x] Share project via public link
- [x] Improved dashboard with dates, segments, actors, language badge
- [x] Public shared project page (no auth required)

### Round 2 (Editor Power Tools)
- [x] Rename project (click title to edit inline)
- [x] Duplicate project
- [x] Auto-save indicator (Saved / Saving...)
- [x] Color-coded speaker rows (different color per actor)
- [x] Merge segments (select 2+ and merge)
- [x] Split segments (scissors button)
- [x] Batch export (MP3 + MP4 + SRT all at once)
- [x] Search in segments
- [x] Browser notification when processing done
- [x] Parallel TTS processing (5 segments at a time, 2-3x faster)
- [x] Auto-process button (one click: Detect → Translate → Audio)
- [x] Queue status tracking per project
- [x] Voice Pitch slider (-6 to +6 semitones) **per actor** for older/deeper or younger/higher voice
- [x] FFmpeg pitch post-processing on TTS audio (preview + full generation)
- [x] GPT auto-detects actor **age** (~20s, ~30s, ~40s, etc.) and **role** (Narrator, Boss, Wife) from dialogue
- [x] Actor cards show role badge and age badge
- [x] GPT detects **emotion** per line (happy, sad, angry, calm, excited, scared, serious)
- [x] SSML prosody: voice speed/pitch/volume adjusts per emotion (happy=faster+higher, sad=slower+softer, angry=louder)
- [x] Natural pauses: auto-insert breathing pauses after punctuation marks
- [x] Original voice mixing: original speaker audio mixed at 10% volume behind Khmer TTS for natural feel

## Prioritized Backlog

### P2 (Medium Priority)
- [ ] Background music preservation
- [ ] Adjust volume per segment
- [ ] Trim video before dubbing
- [ ] TikTok/YouTube format export
- [ ] Mobile friendly layout
- [ ] Project tags/folders

### P3 (Low Priority)
- [ ] AI voice cloning (needs paid API)
- [ ] Auto lip sync (complex AI)
- [ ] Team workspace / collaboration
- [ ] Waveform timeline visualization
- [ ] Usage analytics dashboard

## Key Technical Notes
- Edge TTS voices: km-KH-PisethNeural (Male), km-KH-SreymomNeural (Female)
- DO NOT use pitch analysis for gender detection - use GPT dialogue analysis
- Custom audio hierarchy: Segment Custom > Actor Custom > AI TTS
- Whisper auto-detects language (no hardcoded "zh")
- Share system: share_token stored in project doc, public endpoints at /api/shared/{token}
- Merge/Split endpoints re-index segment IDs after operation
