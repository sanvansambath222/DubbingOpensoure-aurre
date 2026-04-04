# VoxiDub.AI - AI Video Dubbing Platform

Complete deployment guide. Follow step by step.

---

## What is VoxiDub?

VoxiDub.AI translates and dubs videos to any language using AI.

**Features:**
- Upload video -> Auto transcribe -> Translate -> Dub -> Download
- 322 voices in 75 languages (Edge TTS) 
- Khmer TTS (Piseth + Sreymom + Meta AI)
- AI speaker detection (male/female)
- AI vocal removal (keeps background music)
- 9 standalone tools (Subtitle, Trim, Resize, Logo, Convert, TTS, Voice Replace, AI Clips, Translate)

**Tech Stack:** React + FastAPI + MongoDB + Whisper + Demucs + SpeechBrain + Edge TTS + FFmpeg

---

## PART 1: Create GCP Server

### Step 1: Go to Google Cloud Console
```
https://console.cloud.google.com
```

### Step 2: Create VM Instance
1. Go to **Compute Engine** -> **VM instances** -> **Create Instance**
2. Choose settings:

**For CPU server (cheap, good for 1-10 users):**
| Setting | Value |
|---------|-------|
| Name | voxidub-server |
| Region | asia-southeast1 (Singapore) |
| Machine type | e2-standard-2 (2 CPU, 8GB RAM) |
| Boot disk | Debian 13, 100GB SSD |
| Firewall | Allow HTTP + HTTPS |

**For GPU server (fast, good for 100+ users):**
| Setting | Value |
|---------|-------|
| Name | voxidub-server |
| Region | us-central1 (cheapest GPU) |
| Machine type | n1-standard-4 (4 CPU, 15GB RAM) |
| GPU | NVIDIA T4 x 1 |
| Boot disk | Debian 13, 200GB SSD |
| Firewall | Allow HTTP + HTTPS |

3. Click **Create**
4. Wait 1-2 minutes

### Step 3: Open Firewall Ports
1. Go to **VPC Network** -> **Firewall** -> **Create Firewall Rule**
2. Settings:

| Setting | Value |
|---------|-------|
| Name | allow-web |
| Direction | Ingress |
| Targets | All instances |
| Source | 0.0.0.0/0 |
| Protocols | TCP: 80, 443 |

3. Click **Create**

### Step 4: SSH into your server
1. Go to **VM instances**
2. Click **SSH** button next to your server
3. A terminal window opens

---

## PART 2: Install Everything

Copy and paste these commands ONE BY ONE in SSH:

### Step 1: Update system
```bash
sudo apt update && sudo apt upgrade -y
```

### Step 2: Install required packages
```bash
sudo apt install -y python3 python3-pip python3-venv python3-full nodejs npm nginx git ffmpeg curl wget build-essential
```

### Step 3: Install MongoDB
```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

Check MongoDB is running:
```bash
sudo systemctl status mongod
```
You should see **active (running)**.

### Step 4: Install Node.js 18+ and Yarn
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g yarn
```

Check versions:
```bash
node -v    # Should show v18+
yarn -v    # Should show 1.22+
```

### Step 5: Add Swap (important for low RAM servers!)
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Check swap:
```bash
free -h
```
You should see 4G swap.

---

## PART 3: Install VoxiDub

### Step 1: Clone the project
```bash
cd /home
sudo git clone https://github.com/sanvansambath222/DubbingOpensoure.git voxidub
sudo chown -R $USER:$USER /home/voxidub
cd /home/voxidub
```

### Step 2: Setup Backend
```bash
cd /home/voxidub/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 3: Create Backend .env file
```bash
nano /home/voxidub/backend/.env
```

Paste this inside (change YOUR_KEY):
```
MONGO_URL=mongodb://localhost:27017/voxidub
DB_NAME=voxidub
JWT_SECRET=your_random_secret_key_here_change_this
EMERGENT_LLM_KEY=your_emergent_key_here
```

Save: Ctrl+X, Y, Enter

**How to get Emergent LLM Key:**
1. Go to https://emergentagent.com
2. Create account
3. Go to Profile -> Universal Key
4. Copy the key

### Step 4: Setup Frontend
```bash
cd /home/voxidub/frontend
```

Edit the .env file:
```bash
nano /home/voxidub/frontend/.env
```

Change to your server IP or domain:
```
REACT_APP_BACKEND_URL=http://YOUR_SERVER_IP
```

Example: `REACT_APP_BACKEND_URL=http://123.456.789.10`

Save: Ctrl+X, Y, Enter

Install and build:
```bash
yarn install
yarn build
```

### Step 5: Create upload folders
```bash
mkdir -p /home/voxidub/uploads/voxidub
mkdir -p /home/voxidub/uploads/tools_output
mkdir -p /home/voxidub/tmp
```

---

## PART 4: Setup Services (Auto-start)

### Step 1: Create Backend Service
```bash
sudo nano /etc/systemd/system/voxidub-backend.service
```

Paste this (change YOUR_USERNAME):
```ini
[Unit]
Description=VoxiDub Backend
After=network.target mongod.service

[Service]
User=YOUR_USERNAME
WorkingDirectory=/home/voxidub/backend
Environment=PATH=/home/voxidub/backend/venv/bin:/usr/local/bin:/usr/bin
Environment=HOME=/home/YOUR_USERNAME
Environment=TMPDIR=/home/voxidub/tmp
ExecStart=/home/voxidub/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**How to find YOUR_USERNAME:**
```bash
whoami
```

Save: Ctrl+X, Y, Enter

### Step 2: Start Backend
```bash
sudo systemctl daemon-reload
sudo systemctl start voxidub-backend
sudo systemctl enable voxidub-backend
```

Check it's running:
```bash
sudo systemctl status voxidub-backend
```

Test API:
```bash
curl http://localhost:8001/api/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"test","password":"test"}'
```

---

## PART 5: Setup Nginx (Web Server)

### Step 1: Create Nginx config
```bash
sudo nano /etc/nginx/sites-enabled/voxidub
```

Paste this (change YOUR_SERVER_IP):
```nginx
server {
    listen 80;
    server_name YOUR_SERVER_IP;

    client_max_body_size 500M;

    # Frontend
    location / {
        root /home/voxidub/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

Save: Ctrl+X, Y, Enter

### Step 2: Remove default config (if exists)
```bash
sudo rm -f /etc/nginx/sites-enabled/default
```

### Step 3: Test and restart Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Step 4: Open in browser
```
http://YOUR_SERVER_IP
```

You should see VoxiDub!

---

## PART 6: Create Test User

**Important: Change the email and password below to your own!**

```bash
cd /home/voxidub && source backend/venv/bin/activate 2>/dev/null; python3 -c "
import pymongo, bcrypt, uuid
client = pymongo.MongoClient('mongodb://localhost:27017/voxidub')
db = client['voxidub']
from datetime import datetime, timezone
password = bcrypt.hashpw('YOUR_PASSWORD_HERE'.encode(), bcrypt.gensalt()).decode()
db.users.insert_one({
    'user_id': 'user_' + uuid.uuid4().hex[:12],
    'email': 'YOUR_EMAIL_HERE',
    'name': 'Admin',
    'picture': '',
    'password_hash': password,
    'auth_provider': 'email',
    'created_at': datetime.now(timezone.utc).isoformat()
})
print('User created!')
"
```

Replace `YOUR_EMAIL_HERE` and `YOUR_PASSWORD_HERE` with your own credentials.

---

## PART 7: Setup Domain Name

### Step 1: Buy domain
Go to one of these:
- https://spaceship.com (cheap)
- https://namecheap.com
- https://cloudflare.com

Buy a domain like `voxidub.com`

### Step 2: Add DNS records
In your domain provider, add these DNS records:

| Type | Host | Value |
|------|------|-------|
| A | @ | YOUR_SERVER_IP |
| A | www | YOUR_SERVER_IP |

Wait 5-30 minutes for DNS to work.

### Step 3: Update Nginx config
```bash
sudo nano /etc/nginx/sites-enabled/voxidub
```

Change the `server_name` line:
```nginx
server_name yourdomain.com www.yourdomain.com YOUR_SERVER_IP;
```

Save and reload:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Step 4: Update Frontend .env
```bash
nano /home/voxidub/frontend/.env
```

Change to:
```
REACT_APP_BACKEND_URL=https://yourdomain.com
```

Rebuild:
```bash
cd /home/voxidub/frontend && yarn build
```

---

## PART 8: Setup SSL (HTTPS) - Free!

### Step 1: Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Step 2: Get SSL certificate
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

It will ask:
- Email: type your email, press Enter
- Agree: type Y, press Enter
- Share email: type N, press Enter

### Step 3: Test
Open `https://yourdomain.com` - should work with HTTPS lock icon!

### Step 4: Auto-renew (already set by Certbot)
Check:
```bash
sudo certbot renew --dry-run
```

---

## PART 9: Setup Cloudflare (Protection + CDN)

### Step 1: Create Cloudflare account
Go to https://dash.cloudflare.com/sign-up (free)

### Step 2: Add your domain
- Click "Add a site"
- Type your domain name
- Choose **Free plan**

### Step 3: Add DNS records in Cloudflare
| Type | Name | Value | Proxy |
|------|------|-------|-------|
| A | @ | YOUR_SERVER_IP | Orange cloud ON |
| A | www | YOUR_SERVER_IP | Orange cloud ON |

### Step 4: Change nameservers
Cloudflare gives you 2 nameservers like:
```
xxx.ns.cloudflare.com
yyy.ns.cloudflare.com
```

Go to your domain provider (Spaceship/Namecheap):
- Find **Nameservers** settings
- Replace with Cloudflare nameservers
- Save

### Step 5: SSL settings in Cloudflare
- Go to **SSL/TLS** -> Set to **Full (strict)**

### Step 6: Wait
- Takes 5-30 minutes to activate
- Cloudflare shows "Active" when ready

---

## PART 10: Upgrade to GPU Server (Optional)

If you need faster processing for many users:

### Step 1: Create GPU VM in GCP
| Setting | Value |
|---------|-------|
| Machine type | n1-standard-4 |
| GPU | NVIDIA T4 x 1 |
| Boot disk | Debian 13, 200GB SSD |
| Region | us-central1 |

### Step 2: Install NVIDIA drivers
```bash
sudo apt install -y linux-headers-$(uname -r)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

sudo apt update
sudo apt install -y nvidia-driver
sudo reboot
```

After reboot, check GPU:
```bash
nvidia-smi
```

### Step 3: Install CUDA (for PyTorch GPU)
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### Step 4: Follow PART 2-9 above for the rest

---

## Useful Commands

### Check services
```bash
sudo systemctl status voxidub-backend
sudo systemctl status mongod
sudo systemctl status nginx
```

### Restart services
```bash
sudo systemctl restart voxidub-backend
sudo systemctl restart mongod
sudo systemctl restart nginx
```

### View backend logs
```bash
sudo journalctl -u voxidub-backend -n 50 --no-pager
```

### Check disk space
```bash
df -h
```

### Check RAM usage
```bash
free -h
```

### Clean up old files (free disk space)
```bash
rm -rf /home/voxidub/uploads/voxidub/*
rm -rf /home/voxidub/uploads/tools_output/*
rm -rf /home/voxidub/tmp/*
```

### Update VoxiDub (after new code push)
```bash
cd /home/voxidub
git stash
git pull origin main
cd frontend && yarn build
sudo systemctl restart voxidub-backend
```

### Fix: Backend crash (out of memory)
```bash
sudo systemctl restart voxidub-backend
```

### Fix: MongoDB not starting (disk full)
```bash
rm -rf /home/voxidub/uploads/voxidub/*
rm -rf /tmp/*
sudo systemctl restart mongod
sudo systemctl restart voxidub-backend
```

### Fix: Cannot SSH (VM frozen)
1. Go to GCP Console -> VM instances
2. Click STOP
3. Wait 30 seconds
4. Click START
5. SSH again

---

## Server Costs

| Server Type | CPU | RAM | Cost/month |
|-------------|-----|-----|------------|
| e2-micro | 2 | 1GB | $7 |
| e2-small | 2 | 2GB | $14 |
| e2-medium | 2 | 4GB | $34 |
| e2-standard-2 | 2 | 8GB | $67 |
| e2-standard-4 | 4 | 16GB | $134 |
| n1-standard-4 + T4 GPU | 4 | 15GB | $400 |

**Recommended:** e2-standard-2 (8GB RAM) minimum for VoxiDub.

---

## Support

- GitHub Issues: https://github.com/sanvansambath222/DubbingOpensoure/issues
- Website: https://voxidub.com
