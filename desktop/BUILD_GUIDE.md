# VoxiDub.AI Desktop App - Build Guide

## Requirements (on YOUR Windows PC)

### Install these first:
1. **Node.js** (v18+) → https://nodejs.org
2. **Python** (3.10+) → https://python.org (check "Add to PATH")
3. **MongoDB** → https://www.mongodb.com/try/download/community
4. **Yarn** → Run: `npm install -g yarn`
5. **FFmpeg** → https://ffmpeg.org/download.html (add to PATH)
6. **Git** → https://git-scm.com

### Install Python packages:
```
pip install fastapi uvicorn motor pymongo bcrypt pyjwt edge-tts pydub aiofiles python-multipart speechbrain torch torchaudio transformers
```

## Build Steps

### Method 1: Auto Build (Easy)
```
cd desktop
build-win.bat
```

### Method 2: Manual Build

#### Step 1: Clone the repo
```
git clone https://github.com/sanvansambath222/DubbingOpensoure.git
cd DubbingOpensoure
```

#### Step 2: Build React frontend
```
cd frontend
set REACT_APP_BACKEND_URL=http://localhost:8001
yarn install
yarn build
cd ..
```

#### Step 3: Copy files to desktop folder
```
xcopy /E /I /Y frontend\build desktop\build
xcopy /E /I /Y backend desktop\backend
```

#### Step 4: Create backend .env
Create file `desktop/backend/.env`:
```
MONGO_URL=mongodb://localhost:27017/voxidub
DB_NAME=voxidub
JWT_SECRET=<generate-a-unique-random-secret>
EMERGENT_LLM_KEY=your_key_here
```

#### Step 5: Install desktop dependencies
```
cd desktop
yarn install
```

#### Step 6: Test (dev mode)
```
yarn start
```

#### Step 7: Build .exe
```
yarn dist-win
```

The .exe will be in `desktop/dist/` folder.

## For Users (Installing the .exe)

### What users need:
1. **Windows 10 or 11**
2. **MongoDB** installed and running
3. **Python 3.10+** installed
4. **FFmpeg** installed
5. **8GB+ RAM** recommended
6. **Internet** (for GPT translation + Whisper)

### First Run:
1. Install VoxiDub.AI.exe
2. Start MongoDB
3. Open VoxiDub.AI
4. Enter license key
5. Enter Emergent LLM Key (for AI features)
6. Start dubbing!

## Selling the .exe

### Option 1: Gumroad
- Upload .exe to https://gumroad.com
- Set price $50-100 one-time or $20/month
- Gumroad handles payments

### Option 2: Your Website
- Add download page to voxidub.com
- Use Stripe for payments
- Generate license keys after payment

### Option 3: Telegram
- Sell via Telegram bot
- Send .exe after payment
- License key in message

## License Key System
- Each key tied to 1 machine
- Check online monthly
- Offline mode: 7 days without internet
- Server: https://voxidub.com/api/license
