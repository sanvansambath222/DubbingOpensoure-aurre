# VoxiDub - PRD

## Problem Statement
Build a video/audio dubbing platform with AI transcription, translation, TTS voices, subtitle editing, AI vocal removal, standalone video/audio tools, desktop .exe app, and Google Cloud deployment.

## Architecture
- Frontend: React | Backend: FastAPI | Database: MongoDB | Storage: Local
- Auth: Email/Password + Google OAuth
- Production: Google Cloud VM + voxidub.com (Cloudflare)
- Desktop: Electron + Python backend

## Completed Features
- [x] Video/audio upload and processing
- [x] Whisper transcription + GPT-5.2 translation
- [x] Edge TTS: Piseth (male) + Sreymom (female) — default auto-process
- [x] Meta MMS Khmer TTS: Normal speed (1.0)
- [x] 322 Edge TTS voices across 75 languages
- [x] Voice preview + search in all tools
- [x] SpeechBrain ECAPA-TDNN speaker diarization
- [x] Autocorrelation F0 pitch gender detection
- [x] Demucs AI vocal removal (chunked)
- [x] 9 Standalone Tools
- [x] Professional Tools page with drag & drop UI
- [x] VoxiDub.AI logo (round icon + name) in all navbars
- [x] No "free" text anywhere (paid product)
- [x] 10-minute video upload limit + 500MB size limit
- [x] Auto-delete projects after 6 hours
- [x] Google Cloud deployment (voxidub.com)
- [x] SSL/HTTPS via Let's Encrypt
- [x] Nginx reverse proxy configured
- [x] License key system API (generate/check/activate)
- [x] Desktop app structure (Electron + build scripts)

## Desktop App (.exe)
- `/app/desktop/` — Electron project
- `main.js` — Electron main process, starts Python backend
- `preload.js` — Bridge between Electron and React
- `license.js` — License key validation
- `splash.html` — Loading screen
- `build-win.bat` — Auto build script
- `BUILD_GUIDE.md` — Complete build instructions
- License API: POST /api/license/check, /activate, /generate

## Upcoming Tasks
- [ ] Stripe payment (Free/Basic/Pro plans) (P0)
- [ ] Usage limits per plan (P0)
- [ ] Cloudflare protection setup (P0)
- [ ] Queue system for multiple users (P1)

## Future Tasks
- [ ] Telegram bot integration (P1)
- [ ] Cloud APIs (Replicate) for heavy processing (P1)
- [ ] AI voice cloning — needs GPU (P2)
- [ ] Mobile-friendly layout (P2)
- [ ] Export different video quality (P2)
- [ ] Team workspace (P3)
- [ ] Refactor server.py into routes/services (P1)

## Google Cloud Deployment
- Server: e2-highcpu-4 (4 vCPU, 4GB RAM)
- Domain: voxidub.com (Spaceship + Cloudflare)
- IP: (see server dashboard)
- Swap: 4GB (recommended)
- TMPDIR: /home/voxidub/tmp
