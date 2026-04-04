#!/bin/bash
# ============================================
# VoxiDub - Google Cloud Setup Script
# Run this on your Google Cloud server
# ============================================

set -e
echo "========================================="
echo "  VoxiDub Server Setup - Starting..."
echo "========================================="

# Get server external IP
SERVER_IP=$(curl -s http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H "Metadata-Flavor: Google" 2>/dev/null || curl -s ifconfig.me)
echo "Server IP: $SERVER_IP"

# Step 1: Update system
echo ""
echo "[1/10] Updating system..."
sudo apt update && sudo apt upgrade -y

# Step 2: Install dependencies
echo ""
echo "[2/10] Installing Python, Node.js, FFmpeg, Git, Nginx..."
sudo apt install -y python3 python3-pip python3-venv ffmpeg git nginx curl gnupg software-properties-common

# Step 3: Install Node.js 18
echo ""
echo "[3/10] Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g yarn

# Step 4: Install MongoDB
echo ""
echo "[4/10] Installing MongoDB..."
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org || {
    echo "MongoDB repo install failed, trying direct..."
    sudo apt install -y mongodb
}
sudo systemctl enable mongod || sudo systemctl enable mongodb
sudo systemctl start mongod || sudo systemctl start mongodb
echo "MongoDB started!"

# Step 5: Clone repo
echo ""
echo "[5/10] Cloning VoxiDub from GitHub..."
cd /home
sudo rm -rf voxidub
sudo git clone https://github.com/sanvansambath222/DubbingOpensoure.git voxidub
sudo chown -R $USER:$USER /home/voxidub
cd /home/voxidub

# Step 6: Setup Backend
echo ""
echo "[6/10] Setting up Backend..."
cd /home/voxidub/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

# Create backend .env
cat > /home/voxidub/backend/.env << ENVFILE
MONGO_URL=mongodb://localhost:27017/voxidub
DB_NAME=voxidub
JWT_SECRET=$(openssl rand -hex 32)
EMERGENT_LLM_KEY=REPLACE_WITH_YOUR_KEY
ENVFILE

echo "Backend .env created! You need to add your EMERGENT_LLM_KEY later."

# Step 7: Setup Frontend
echo ""
echo "[7/10] Setting up Frontend..."
cd /home/voxidub/frontend
yarn install

# Create frontend .env
cat > /home/voxidub/frontend/.env << ENVFILE
REACT_APP_BACKEND_URL=http://$SERVER_IP
ENVFILE

# Build frontend for production
yarn build
echo "Frontend built!"

# Step 8: Create systemd service for backend
echo ""
echo "[8/10] Creating backend service..."
sudo tee /etc/systemd/system/voxidub-backend.service > /dev/null << SERVICE
[Unit]
Description=VoxiDub Backend
After=network.target mongod.service

[Service]
User=$USER
WorkingDirectory=/home/voxidub/backend
Environment=PATH=/home/voxidub/backend/venv/bin:/usr/local/bin:/usr/bin
ExecStart=/home/voxidub/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable voxidub-backend
sudo systemctl start voxidub-backend
echo "Backend service started on port 8001!"

# Step 9: Configure Nginx
echo ""
echo "[9/10] Configuring Nginx..."
sudo tee /etc/nginx/sites-available/voxidub > /dev/null << NGINX
server {
    listen 80;
    server_name $SERVER_IP;
    client_max_body_size 500M;
    proxy_read_timeout 300s;
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }

    # Frontend (built files)
    location / {
        root /home/voxidub/frontend/build;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    # Uploaded files
    location /uploads/ {
        alias /home/voxidub/uploads/;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/voxidub /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
echo "Nginx configured!"

# Step 10: Create uploads directory
echo ""
echo "[10/10] Final setup..."
mkdir -p /home/voxidub/uploads
mkdir -p /home/voxidub/uploads/tools_output

echo ""
echo "========================================="
echo "  VoxiDub Setup COMPLETE!"
echo "========================================="
echo ""
echo "  Your app: http://$SERVER_IP"
echo "  Backend:  http://$SERVER_IP/api/"
echo ""
echo "  IMPORTANT: Edit your API key:"
echo "  nano /home/voxidub/backend/.env"
echo "  Change EMERGENT_LLM_KEY=REPLACE_WITH_YOUR_KEY"
echo "  to your real key, then restart:"
echo "  sudo systemctl restart voxidub-backend"
echo ""
echo "========================================="
