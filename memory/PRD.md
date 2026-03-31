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
- **Theme**: Swiss & High-Contrast with Dark Mode support
- **Fonts**: Outfit (headings), IBM Plex Sans (body), JetBrains Mono (code/timestamps)
- **Colors**: White/Zinc-950 backgrounds, zinc text, emerald accents, sharp corners (rounded-sm)
- **Dark Mode**: Full dark mode with toggle button (Sun/Moon icons), persists in localStorage
- **Actor cards**: White bg with strong blue left-border (Boy), pink left-border (Girl) in light mode. Zinc-800 bg in dark mode.
- **Frontend**: React 19, Tailwind CSS (darkMode: class), Phosphor Icons, Framer Motion
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
- [x] Auto-process button (one click: Detect -> Translate -> Audio)
- [x] Queue status tracking per project
- [x] Voice Pitch slider (-6 to +6 semitones) per actor
- [x] FFmpeg pitch post-processing on TTS audio
- [x] GPT auto-detects actor age and role from dialogue
- [x] Actor cards show role badge and age badge

### Round 3 (UI/UX)
- [x] Complete Swiss Light Theme UI redesign
- [x] Dark Mode with toggle (Sun/Moon icon) across all pages
- [x] Theme persistence in localStorage
- [x] Landing page, Dashboard, Editor, SharedProject all support dark mode
- [x] Actor card color fix - removed washed-out gradients, now clean white/dark bg with strong blue/pink accent borders

## Prioritized Backlog

### P2 (Medium Priority)
- [ ] AI voice cloning (needs paid API)
- [ ] Auto lip sync (complex AI)
- [ ] Drag to adjust timing
- [ ] Export different video quality
- [ ] Background music preservation
- [ ] Adjust volume per segment
- [ ] Trim video before dubbing
- [ ] TikTok/YouTube format export
- [ ] Mobile friendly layout
- [ ] Project tags/folders

### P3 (Low Priority)
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
- DO NOT re-add SSML/Emotion TTS features - user explicitly removed them
- Dark mode uses Tailwind `class` strategy with isDark state in AuthContext
