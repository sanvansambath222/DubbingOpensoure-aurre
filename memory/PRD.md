# VoxiDub - PRD

## Problem Statement
Build a video/audio dubbing platform with AI transcription, translation, TTS voices, subtitle editing, AI vocal removal, standalone video/audio tools, Telegram delivery, and Google Cloud deployment.

## Architecture
- Frontend: React | Backend: FastAPI | Database: MongoDB | Storage: Local
- Auth: Email/Password + Google OAuth
- Production: Google Cloud VM (34.177.89.44) + voxidub.com domain + SSL
- Telegram Bot: @VoxiDubBot for auto video delivery

## Completed Features
- [x] Video/audio upload and processing
- [x] Whisper transcription + GPT-5.2 translation
- [x] Edge TTS: Piseth (male) + Sreymom (female) — default voices
- [x] Meta MMS Khmer TTS: Boy + Girl (normal speed)
- [x] SpeechBrain ECAPA-TDNN speaker diarization
- [x] Autocorrelation F0 pitch gender detection (median, threshold 175Hz)
- [x] GPT role-name gender override (Husband→male, Wife→female, etc.)
- [x] Demucs AI vocal removal (chunked)
- [x] Background async processing
- [x] 10 Standalone Tools (Voice Replace, Subtitles, Translate, Trim, AI Clips, TTS, Resize, Convert, Add Logo, **Remove Logo**)
- [x] 322 Edge TTS voices across 75 languages with search
- [x] Voice preview (play before select)
- [x] VoxiDub.AI logo (round icon + text) in navbar
- [x] Favicon updated to VoxiDub logo
- [x] 10-minute / 500MB video upload limit
- [x] Auto-delete projects after 6 hours
- [x] Processing overlay with Done/Error close buttons
- [x] "You can close this tab" message during processing
- [x] Domain: voxidub.com + SSL (Let's Encrypt)
- [x] Telegram Bot Integration — auto-send dubbed videos to user's Telegram
- [x] Connect Telegram button on dashboard with code-based linking
- [x] Telegram modal centered — Fixed via React Portal
- [x] Telegram warning banner — Dashboard shows "Connect Telegram to receive your videos"
- [x] Telegram bot welcome upgrade — /start sends HTML message with clickable button
- [x] Telegram video caption upgrade — Shows source→target language
- [x] Tools page UI upgrade — Bento grid layout, colored icon backgrounds, accent colors, AI badges
- [x] Subscription system — 4 plans (Free $0, Basic $5, Pro $15, Business $39)
- [x] Credit pack system — Pay per video: 5/$3, 20/$10, 50/$20, 100/$35
- [x] Pricing page — Tabbed layout, FAQ, ABA PayWay payment methods
- [x] Subscription APIs — /subscription/plans, /me, /use-credit, /buy-credits, /activate, /history
- [x] Queue system — asyncio.Lock processes 1 video at a time, waitlist with position
- [x] Free plan 2 videos — Changed from 1 to 2 videos per month
- [x] **Queue bug fix** — Fixed stale project data, missing error handling, queue_status not updating to "done"
- [x] **Frontend queue fix** — Editor.jsx now handles "queued" status same as "processing" for polling
- [x] **Remove Logo tool** — FFmpeg delogo + blur filters, draw-to-select UI, 2 removal methods

## Upcoming Tasks
- [ ] ABA PayWay Payment Integration (blocked: waiting for sandbox API keys from user)
- [ ] Refactor server.py (~4000 lines → split into routes/services) — P1
- [ ] Mobile-friendly layout tweaks — P2
- [ ] Export different video qualities — P2
- [ ] Nginx/Cloudflare setup — P2
- [ ] OpenVoice v2 voice cloning (needs GPU/more RAM) — P3

## Google Cloud Deployment
- Server: e2-highcpu-4 (4 vCPU, 4GB RAM), Debian 13
- IP: 34.177.89.44
- Domain: voxidub.com (SSL via Let's Encrypt)
- Update commands:
  ```
  cd /home/voxidub
  git fetch origin main
  git reset --hard origin/main
  cd frontend && yarn build
  sudo systemctl restart voxidub-backend
  ```
