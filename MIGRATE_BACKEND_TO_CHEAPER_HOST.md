# 🚀 MIGRATE BACKEND TO CHEAPER HOST

**Goal:** Move backend from Emergent hosting to save credits  
**Status:** Step-by-step migration guide  
**Estimated Time:** 1-2 hours

---

## 🎯 WHY MIGRATE?

### Current Situation:
- Backend hosted on Emergent (nexryde-ui.emergent.host)
- Using Emergent credits for hosting
- Credits draining fast

### After Migration:
- ✅ Backend on cheap VPS ($5-10/month)
- ✅ No more Emergent hosting credits used
- ✅ Only pay for actual AI usage (if you re-enable it)
- ✅ Full control over server

---

## 💰 HOSTING OPTIONS (CHEAPEST TO MOST EXPENSIVE)

### 1️⃣ DigitalOcean Droplet (RECOMMENDED)
**Cost:** $6/month (1GB RAM, 1 CPU, 25GB SSD)
**Best for:** Small to medium apps
**Pros:**
- ✅ Very cheap
- ✅ Easy setup
- ✅ Great documentation
- ✅ Fast deployment

**Sign up:** https://www.digitalocean.com
**Free credit:** $200 for 60 days (new users)

---

### 2️⃣ Hetzner Cloud (CHEAPEST)
**Cost:** $3.29/month (2GB RAM, 1 CPU, 20GB SSD)
**Best for:** Budget-conscious
**Pros:**
- ✅ Cheapest option
- ✅ Europe/US servers
- ✅ Good performance

**Sign up:** https://www.hetzner.com/cloud

---

### 3️⃣ Linode (Akamai)
**Cost:** $5/month (1GB RAM)
**Best for:** Reliability
**Pros:**
- ✅ Reliable
- ✅ Good support
- ✅ Nigerian data centers nearby

**Sign up:** https://www.linode.com

---

### 4️⃣ Vultr
**Cost:** $5/month (1GB RAM)
**Best for:** Performance
**Pros:**
- ✅ Fast
- ✅ Multiple locations
- ✅ Easy scaling

**Sign up:** https://www.vultr.com

---

### 5️⃣ AWS Lightsail
**Cost:** $5/month (512MB RAM)
**Best for:** AWS ecosystem
**Pros:**
- ✅ Part of AWS
- ✅ Easy to scale
**Cons:**
- ⚠️ Can get expensive with extras

**Sign up:** https://aws.amazon.com/lightsail

---

### 6️⃣ Railway.app (EASIEST)
**Cost:** $5/month usage-based
**Best for:** Beginners
**Pros:**
- ✅ EASIEST deployment (Git push to deploy!)
- ✅ Automatic SSL
- ✅ No server management
**Cons:**
- ⚠️ Usage-based (can get expensive)

**Sign up:** https://railway.app

---

## 🚀 MIGRATION STEPS (DigitalOcean Example)

### Step 1: Create New Server (5 minutes)

1. **Sign up for DigitalOcean:**
   - Go to https://www.digitalocean.com
   - Use referral code for $200 free credit

2. **Create a Droplet:**
   - Click "Create" → "Droplets"
   - **Image:** Ubuntu 22.04 LTS
   - **Plan:** Basic ($6/month, 1GB RAM)
   - **Datacenter:** London or Frankfurt (closest to Nigeria)
   - **Authentication:** SSH Key or Password
   - Click "Create Droplet"

3. **Note your server IP:**
   - Example: `164.92.xxx.xxx`

---

### Step 2: Setup Server (10 minutes)

```bash
# SSH into your new server
ssh root@164.92.xxx.xxx

# Update system
apt update && apt upgrade -y

# Install Python 3.11
apt install -y python3.11 python3.11-venv python3-pip

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update
apt install -y mongodb-org
systemctl start mongod
systemctl enable mongod

# Install Nginx (for reverse proxy)
apt install -y nginx

# Create app directory
mkdir -p /home/ubuntu/nexryde
cd /home/ubuntu/nexryde
```

---

### Step 3: Clone Your Code (5 minutes)

```bash
# On the new server:
cd /home/ubuntu/nexryde
git clone https://github.com/YOUR-USERNAME/nexryde.git .

# OR if you need to authenticate:
git clone https://YOUR-TOKEN@github.com/YOUR-USERNAME/nexryde.git .
```

---

### Step 4: Setup Backend (10 minutes)

```bash
cd /home/ubuntu/nexryde/backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
nano .env
```

**Add this to `.env`:**
```env
# MongoDB
MONGO_URL=mongodb://localhost:27017/
DB_NAME=nexryde_db

# Google Maps
GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_KEY_REDACTED

# Termii SMS
TERMII_API_KEY=TLuufgzYJpodibfqFNFPWbzSWTvLgJzSVWGBKbtIracYRVWTAPjAVSxARPNPJU
TERMII_FROM_ID=NEXRYDE
TERMII_BASE_URL=https://v3.api.termii.com

# Emergent Auth
EMERGENT_AUTH_URL=https://auth.emergentagent.com/session-data

# IMPORTANT: Leave this EMPTY to save credits!
EMERGENT_LLM_KEY=

# Google Speech (if you have the key file)
GOOGLE_CLOUD_SPEECH_KEY=nexryde-speech-key.json

# Server
PORT=8000
```

**Save:** `Ctrl+O`, `Enter`, `Ctrl+X`

---

### Step 5: Create Systemd Service (5 minutes)

```bash
# Create service file
nano /etc/systemd/system/nexryde-backend.service
```

**Add this:**
```ini
[Unit]
Description=NexRyde Backend API
After=network.target mongodb.service

[Service]
Type=simple
User=root
WorkingDirectory=/home/ubuntu/nexryde/backend
Environment="PATH=/home/ubuntu/nexryde/backend/venv/bin"
ExecStart=/home/ubuntu/nexryde/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Save and enable:**
```bash
systemctl daemon-reload
systemctl enable nexryde-backend
systemctl start nexryde-backend

# Check status
systemctl status nexryde-backend

# Check logs
journalctl -u nexryde-backend -f
```

---

### Step 6: Setup Nginx (Reverse Proxy) (5 minutes)

```bash
nano /etc/nginx/sites-available/nexryde
```

**Add this:**
```nginx
server {
    listen 80;
    server_name YOUR-NEW-DOMAIN.com;  # Or use IP: 164.92.xxx.xxx

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Enable and restart:**
```bash
ln -s /etc/nginx/sites-available/nexryde /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

---

### Step 7: Setup SSL (Free HTTPS) (5 minutes)

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Get SSL certificate (if you have a domain)
certbot --nginx -d YOUR-DOMAIN.com

# OR skip SSL for now and use HTTP
```

---

### Step 8: Update Frontend (5 minutes)

**Edit `frontend/.env`:**
```env
# Change from:
EXPO_PUBLIC_BACKEND_URL=https://nexryde-ui.emergent.host

# To your new server:
EXPO_PUBLIC_BACKEND_URL=http://164.92.xxx.xxx
# OR with domain:
EXPO_PUBLIC_BACKEND_URL=https://YOUR-DOMAIN.com
```

**Rebuild frontend:**
```bash
cd frontend
rm -rf node_modules/.cache .expo
npm start
```

---

### Step 9: Test Everything (5 minutes)

```bash
# Test backend health
curl http://YOUR-NEW-IP/health

# Test OTP endpoint
curl -X POST http://YOUR-NEW-IP/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+2348012345678"}'

# Should return JSON, not HTML!
```

**Test on device:**
1. SMS login ✅
2. Google login ✅
3. Book ride ✅
4. Driver home ✅

---

## 🎯 EASIER OPTION: Railway.app (NO SERVER MANAGEMENT!)

### Why Railway?
- ✅ **No server setup** (Git push to deploy!)
- ✅ **Automatic SSL**
- ✅ **Built-in database**
- ✅ **$5/month** (usage-based)

### Steps:

1. **Sign up:** https://railway.app
2. **Connect GitHub:** Link your nexryde repo
3. **Add MongoDB:** Click "New" → "Database" → "MongoDB"
4. **Deploy backend:**
   - Click "New" → "GitHub Repo" → Select nexryde
   - Set root directory: `backend`
   - Railway auto-detects Python and installs deps
5. **Add environment variables:**
   - Copy all vars from your `.env`
   - Railway provides MongoDB URL automatically
6. **Get your URL:**
   - Railway gives you: `https://nexryde-production.up.railway.app`
7. **Update frontend `.env`:**
   - Change `EXPO_PUBLIC_BACKEND_URL` to Railway URL
8. **Done!** 🎉

---

## 💰 COST COMPARISON

| Host | Monthly Cost | Setup Time | Difficulty |
|------|-------------|------------|-----------|
| **Hetzner** | $3.29 | 1 hour | Medium |
| **DigitalOcean** | $6 | 1 hour | Medium |
| **Linode** | $5 | 1 hour | Medium |
| **Railway** | $5+ | 15 min | **Easy** |
| **Emergent** | $50-200 | 0 | Easy |

---

## 📊 SAVINGS

### Before (Emergent Hosting):
- Hosting: $50-200/month (credit drain)
- Total: **$50-200/month**

### After (DigitalOcean):
- VPS: **$6/month**
- Total: **$6/month**

### Savings: **$44-194/month!** 💰

---

## ⚠️ IMPORTANT NOTES

### 1. MongoDB Data Migration
If you have existing data on Emergent:

```bash
# On Emergent server:
mongodump --db nexryde_db --out /tmp/nexryde-backup

# On new server:
mongorestore --db nexryde_db /tmp/nexryde-backup/nexryde_db
```

### 2. Domain Name (Optional but Recommended)
- Buy from Namecheap ($1-10/year): https://www.namecheap.com
- Point A record to your new server IP
- Setup SSL with Certbot

### 3. Firewall
```bash
# Allow only necessary ports
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw enable
```

---

## 🚀 QUICK START (Railway - EASIEST)

If you want the **FASTEST** migration:

1. Sign up: https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Select your nexryde repo
4. Add MongoDB database
5. Copy environment variables
6. Get Railway URL: `https://nexryde-xxx.up.railway.app`
7. Update frontend `.env` with Railway URL
8. Done! ✅

**Time: 15 minutes**  
**Cost: $5/month**  
**No server management!**

---

## 📞 NEXT STEPS

1. **Choose a host** (Railway = easiest, DigitalOcean = cheapest)
2. **Follow the steps above**
3. **Update frontend** with new backend URL
4. **Test everything**
5. **Shut down Emergent hosting** (save credits!)

---

## ✅ CHECKLIST

- [ ] Choose hosting provider
- [ ] Create new server/account
- [ ] Clone code to new server
- [ ] Install dependencies
- [ ] Setup .env file
- [ ] Start backend service
- [ ] Setup Nginx (if using VPS)
- [ ] Setup SSL (optional)
- [ ] Update frontend `.env`
- [ ] Test all features
- [ ] Migrate MongoDB data (if needed)
- [ ] Update DNS (if using domain)
- [ ] Shutdown Emergent hosting

---

**After migration: Your backend will cost $3-6/month instead of $50-200/month!** 🎉

**Recommend:** Start with **Railway.app** (easiest) or **DigitalOcean** (cheapest).
