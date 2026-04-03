# VoxiDub - PRD

## Problem Statement
Build a video/audio dubbing platform with AI transcription, translation, TTS voices, subtitle editing, AI vocal removal, standalone video/audio tools, and Google Cloud deployment.

## Architecture
- Frontend: React | Backend: FastAPI | Database: MongoDB | Storage: Local
- Auth: Email/Password + Google OAuth
- Production: Google Cloud VM (34.177.89.44)

## Completed Features
- [x] Video/audio upload and processing
- [x] Whisper transcription + GPT-5.2 translation
- [x] Edge TTS: Piseth (male) + Sreymom (female)
- [x] Meta MMS Khmer TTS: Boy + Girl (pitch shift)
- [x] SpeechBrain ECAPA-TDNN speaker diarization
- [x] Autocorrelation F0 pitch gender detection
- [x] Demucs AI vocal removal (chunked)
- [x] Background async processing
- [x] FFmpeg auto-install at startup
- [x] Double-click guard on auto-process
- [x] 9 Standalone Tools (Voice Replace, Subtitles, Translate, Trim, AI Clips, TTS, Resize, Convert, Add Logo)
- [x] Professional Tools page with drag & drop UI
- [x] Google Cloud deployment (34.177.89.44)
- [x] Dynamic cache paths (Path.home() instead of /root/)
- [x] **All-language Edge TTS voices (322 voices, 75 languages) - Feb 2026**
- [x] **Auto-process default: Piseth (dara) male + Sreymom (sophea) female - Feb 2026**
- [x] **Voice search in TTS & Voice Replace tools - Feb 2026**
- [x] **Voice preview (play before select) in VoicePickerModal - Feb 2026**

## Voice System
### Default Auto-Process Voices
| Gender | Voice | Provider |
|--------|-------|----------|
| Boy | Piseth (dara) | Edge TTS |
| Girl | Sreymom (sophea) | Edge TTS |

### All Available Voices
- 322 Edge TTS voices across 75 languages (FREE, open source)
- Meta MMS Khmer: Boy + Girl (AI, local)
- API: GET /api/edge-voices (cached 6 hours)
- Preview: POST /api/edge-tts-preview

## Standalone Tools
| Tool | Backend | Cost |
|------|---------|------|
| Voice Replace | Demucs + Whisper + GPT + TTS + FFmpeg | Emergent Key |
| Add Subtitles | FFmpeg | FREE |
| Translate | GPT-5.2 | Emergent Key |
| Trim Video | FFmpeg | FREE |
| AI Clips | Whisper + GPT-5.2 + FFmpeg | Emergent Key |
| Text to Speech | Edge TTS (all languages) + Meta MMS | FREE |
| Resize Video | FFmpeg | FREE |
| Convert | FFmpeg | FREE |
| Add Logo | FFmpeg | FREE |

## Upcoming Tasks
- [ ] Stripe payment (Free/Basic/Pro/Business) (P0)
- [ ] Usage limits per plan (P0)
- [ ] Domain name setup (voxidub.com) (P1)

## Future Tasks
- [ ] AI voice cloning - needs GPU (P1)
- [ ] Auto lip sync (P1)
- [ ] Mobile-friendly layout (P2)
- [ ] Export different video quality (P2)
- [ ] Team workspace (P3)
- [ ] Refactor server.py into routes/services (P1)

## Google Cloud Deployment
- Server: e2-medium (2 vCPU, 4GB RAM), Debian 13
- IP: 34.177.89.44
- Update commands:
  ```
  cd /home/voxidub && git pull origin main
  cd /home/voxidub/frontend && yarn build
  sudo systemctl restart voxidub-backend
  ```
