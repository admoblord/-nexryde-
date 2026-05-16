# 🚀 DEPLOY TO GOOGLE CLOUD RUN (PAY-PER-USE)

**Best Solution:** Cloud Run charges ONLY when requests come in, not 24/7!  
**Cost:** FREE tier: 2M requests/month, then $0.40 per 1M requests  
**Idle Time:** **$0.00** (no charges when nobody is using your app!)

---

## 💰 WHY CLOUD RUN IS PERFECT FOR YOU

### Current Problem (Emergent):
- Charges 24/7 even with ZERO users
- Credits drain constantly
- **Cost: $50-200/month for idle server**

### With Cloud Run:
- ✅ **FREE when idle** (no users = $0 cost!)
- ✅ **Pay only for actual requests**
- ✅ **Auto-scales** (0 to 1000+ users automatically)
- ✅ **Free tier:** 2 million requests/month
- ✅ **After free tier:** $0.40 per million requests

### Example Cost:
- **0 users:** $0/month
- **100 users, 10,000 requests/month:** $0/month (free tier)
- **1,000 users, 100,000 requests/month:** $0/month (free tier)
- **10,000 users, 3M requests/month:** $0.40/month
- **Google Maps API:** Pay separately (only for actual usage)

**Your credit drain problem = SOLVED!** 🎉

---

## 🚀 DEPLOYMENT GUIDE (30 Minutes)

### Prerequisites:
- Google Cloud account (free tier: $300 credit for 90 days)
- Docker installed (optional, Cloud Run can build for you)
- Your code on GitHub

---

### Step 1: Create Dockerfile (5 minutes)

Create this file in your backend folder:

**File:** `/Users/admoblord/nexryde/backend/Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port (Cloud Run uses PORT env var)
ENV PORT=8080
EXPOSE 8080

# Run the application
CMD exec uvicorn server:app --host 0.0.0.0 --port ${PORT}
```

---

### Step 2: Create .dockerignore (1 minute)

**File:** `/Users/admoblord/nexryde/backend/.dockerignore`

```
__pycache__
*.pyc
*.pyo
*.pyd
.Python
env/
venv/
.env
.venv
pip-log.txt
pip-delete-this-directory.txt
.tox/
.coverage
.coverage.*
.cache
nosetests.xml
coverage.xml
*.cover
*.log
.git
.gitignore
.mypy_cache
.pytest_cache
.hypothesis
*.db
*.sqlite
```

---

### Step 3: Setup Google Cloud (5 minutes)

```bash
# Install Google Cloud CLI
# Mac:
brew install --cask google-cloud-sdk

# OR download from: https://cloud.google.com/sdk/docs/install

# Login
gcloud auth login

# Create a new project (or use existing)
gcloud projects create nexryde-app --name="NexRyde"

# Set project
gcloud config set project nexryde-app

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

---

### Step 4: Deploy to Cloud Run (10 minutes)

```bash
cd /Users/admoblord/nexryde/backend

# Deploy (Cloud Run will build Docker image automatically!)
gcloud run deploy nexryde-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10 \
  --min-instances 0 \
  --timeout 300 \
  --set-env-vars "MONGO_URL=YOUR_MONGO_URL,DB_NAME=nexryde_db,GOOGLE_MAPS_API_KEY=<REDACTED_GOOGLE_MAPS_API_KEY>,SMS_OTP_MOCK=false,EMERGENT_AUTH_URL=https://auth.emergentagent.com/session-data,EMERGENT_LLM_KEY="

# Cloud Run will:
# 1. Build Docker image
# 2. Push to Container Registry
# 3. Deploy to Cloud Run
# 4. Give you a URL!
```

**Important settings:**
- `--min-instances 0` = **Scales to zero when idle** (no charges!)
- `--max-instances 10` = Can handle 10,000+ users
- `--allow-unauthenticated` = Public API (your app needs this)

---

### Step 5: Get Your URL (1 minute)

After deployment, Cloud Run gives you a URL:
```
https://nexryde-backend-xxxxx-uc.a.run.app
```

Copy this URL!

---

### Step 6: Setup MongoDB (Choose One)

#### Option A: MongoDB Atlas (FREE Tier - Recommended)
1. Go to: https://www.mongodb.com/cloud/atlas/register
2. Create free cluster (512MB free forever)
3. Get connection string: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/nexryde_db`
4. Add to Cloud Run env vars

#### Option B: Railway MongoDB ($5/month)
1. Already explained in previous guide

#### Option C: Self-hosted MongoDB
- Requires separate VPS
- Not recommended with Cloud Run

---

### Step 7: Update Frontend (2 minutes)

**File:** `/Users/admoblord/nexryde/frontend/.env`

```env
# Change from:
EXPO_PUBLIC_BACKEND_URL=https://nexryde-ui.emergent.host

# To your Cloud Run URL:
EXPO_PUBLIC_BACKEND_URL=https://nexryde-backend-xxxxx-uc.a.run.app
```

**Rebuild:**
```bash
cd /Users/admoblord/nexryde/frontend
rm -rf node_modules/.cache .expo
npm start
```

---

### Step 8: Update Environment Variables (3 minutes)

Instead of putting secrets in the deploy command, use Cloud Run console:

1. Go to: https://console.cloud.google.com/run
2. Click on **nexryde-backend**
3. Click **"Edit & Deploy New Revision"**
4. Go to **"Variables & Secrets"** tab
5. Add:
```
MONGO_URL=mongodb+srv://...
DB_NAME=nexryde_db
GOOGLE_MAPS_API_KEY=<REDACTED_GOOGLE_MAPS_API_KEY>
SMTP_HOST=...
SMTP_USER=...
SMTP_PASSWORD=...
SMS_OTP_MOCK=false
EMERGENT_AUTH_URL=https://auth.emergentagent.com/session-data
EMERGENT_LLM_KEY=
```

---

## 💰 CLOUD RUN PRICING

### Free Tier (Every Month):
- **2 million requests** FREE
- **360,000 GB-seconds** of memory FREE
- **180,000 vCPU-seconds** FREE

### After Free Tier:
- **Requests:** $0.40 per million
- **Memory:** $0.0000025 per GB-second
- **CPU:** $0.00001 per vCPU-second

### Real-World Cost Examples:

**Scenario 1: No users (your current situation)**
- Requests: 0
- CPU time: 0 seconds
- **Cost: $0.00/month** ✅

**Scenario 2: 100 users, 50 requests each = 5,000 requests/month**
- Within free tier
- **Cost: $0.00/month** ✅

**Scenario 3: 10,000 users, 500,000 requests/month**
- Within free tier
- **Cost: $0.00/month** ✅

**Scenario 4: 100,000 users, 5M requests/month**
- 3M requests over free tier = $1.20
- **Cost: $1.20/month** ✅

---

## 🆚 COMPARISON

| Host | 0 Users | 100 Users | 1,000 Users | 10,000 Users |
|------|---------|-----------|-------------|--------------|
| **Emergent** | $50-150 | $50-150 | $100-200 | $200-500 |
| **Cloud Run** | **$0** | **$0** | **$0** | **$1-5** |
| **Railway** | $5 | $5-10 | $10-20 | $30-50 |
| **DigitalOcean** | $6 | $6 | $6 | $6* |

*DigitalOcean is flat rate but you may need to upgrade server size

---

## 🎯 WHY CLOUD RUN IS BEST FOR YOU

### Your Situation:
- **No users yet** (app in development)
- Credits draining on Emergent
- Need to save money NOW

### Cloud Run Solves This:
1. ✅ **$0 cost** until you have users
2. ✅ **Auto-scales** when users come
3. ✅ **Free tier** covers first 10,000-50,000 users
4. ✅ **No server management**
5. ✅ **Instant deployment** from GitHub

---

## 🚀 QUICK START (DO THIS NOW)

### Step 1: Install Google Cloud SDK (5 min)

**On Mac:**
```bash
brew install --cask google-cloud-sdk
```

**On Windows/Linux:**
Download from: https://cloud.google.com/sdk/docs/install

---

### Step 2: Create Dockerfile (I'll do this)

I'll create the Dockerfile and .dockerignore for you.

---

### Step 3: Deploy (10 min)

Run these commands:
```bash
# Login
gcloud auth login

# Create project
gcloud projects create nexryde-app
gcloud config set project nexryde-app

# Enable APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# Deploy
cd /Users/admoblord/nexryde/backend
gcloud run deploy nexryde-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 0
```

---

### Step 4: Setup MongoDB Atlas (Free)

1. Go to: https://www.mongodb.com/cloud/atlas/register
2. Create **FREE** cluster (M0)
3. Get connection string
4. Add to Cloud Run environment variables

---

## ✅ NEXT STEPS

Should I:
1. **Create the Dockerfile now** (so you can deploy)
2. **Walk you through Cloud Run setup** (step by step)
3. **OR explain Railway.app** (even easier, but costs $5/month minimum)

**Cloud Run = $0/month with no users = PERFECT for you!** 🎉

Which do you want to do?