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
- [x] 9 Standalone Tools (Voice Replace, Subtitles, Translate, Trim, AI Clips, TTS, Resize, Convert, Add Logo)
- [x] 322 Edge TTS voices across 75 languages with search
- [x] Voice preview (play before select)
- [x] VoxiDub.AI logo (round icon + text) in navbar
- [x] Favicon updated to VoxiDub logo
- [x] 10-minute / 500MB video upload limit
- [x] Auto-delete projects after 6 hours
- [x] Processing overlay with Done/Error close buttons
- [x] "You can close this tab" message during processing
- [x] Domain: voxidub.com + SSL (Let's Encrypt)
- [x] **Telegram Bot Integration** — auto-send dubbed videos to user's Telegram
- [x] **Connect Telegram** button on dashboard with code-based linking
- [x] **Telegram modal centered** — Fixed via React Portal (backdrop-blur stacking context fix)
- [x] **Telegram warning banner** — Dashboard shows "Connect Telegram to receive your videos" when not linked
- [x] **Telegram bot welcome upgrade** — /start sends HTML message with clickable "Open VoxiDub.AI" button
- [x] **Telegram video caption upgrade** — Shows source→target language (e.g. "Chinese → Khmer")
- [x] **Tools page UI upgrade** — Bento grid layout, colored icon backgrounds, accent colors, AI badges, professional split header/form design
- [x] **Tools page full redesign** — Complete rewrite with gradient icons (dark), rounded-xl inputs, professional drop zones, lightning bolt buttons, uppercase labels, hover animations
- [x] **Subscription system** — 4 plans (Free $0, Basic $5, Pro $15, Business $39), USD/KHR toggle, usage tracking, video credits
- [x] **Credit pack system** — Pay per video: 5/$3, 20/$10, 50/$20, 100/$35 (Cambodia-friendly pricing)
- [x] **Pricing page** — Tabbed layout (Credit Packs + Monthly Plans), Best Value/Most Popular badges, FAQ, ABA PayWay payment methods
- [x] **Subscription APIs** — /subscription/plans, /me, /use-credit, /buy-credits, /activate, /history

## Telegram Integration
### Flow:
1. User clicks "Connect Telegram" on dashboard
2. Gets code like VXD-WT8M66
3. Opens @VoxiDubBot, sends code
4. Account linked
5. After dubbing → bot auto-sends video to user's private Telegram
6. Server deletes files → 0 disk space
7. User keeps video on Telegram forever (free)

### Endpoints:
- POST /api/telegram/generate-code
- GET /api/telegram/status
- POST /api/telegram/unlink

## Upcoming Tasks
- [ ] Stripe payment (Free/Basic/Pro/Business) (P0)
- [ ] Usage limits per plan (P0)
- [ ] Queue system for multiple users (P0)
- [ ] Cloudflare protection (P1)

## Future Tasks
- [ ] AI voice cloning - needs GPU (P1)
- [ ] Mobile-friendly layout (P2)
- [ ] Export different video quality (P2)
- [ ] Team workspace (P3)
- [ ] Refactor server.py into routes/services (P1)

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
