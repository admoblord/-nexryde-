# 🚀 GOOGLE CLOUD RUN - EASY STEP-BY-STEP GUIDE

**Time:** 30 minutes  
**Cost:** $0/month with no users  
**Skill Level:** Beginner-friendly

---

## ✅ WHAT YOU NEED:

1. ✅ Mac Terminal (you have this)
2. ✅ Google account (Gmail account)
3. ✅ Credit card (for Google Cloud - **won't be charged**, just for verification)
4. ✅ Your backend code (you have this in `/Users/admoblord/nexryde/backend`)

---

## 📋 STEP-BY-STEP GUIDE

### STEP 1: Install Google Cloud SDK (5 minutes)

**Open Terminal on your Mac and run:**

```bash
brew install --cask google-cloud-sdk
```

**What this does:** Installs Google's command-line tool so you can deploy to Cloud Run.

**If it asks for password:** Enter your Mac password (the one you use to login to your Mac).

**Wait for it to finish** - you'll see "Installation successful" or similar.

---

### STEP 2: Initialize Google Cloud SDK (3 minutes)

**In Terminal, run:**

```bash
gcloud init
```

**What will happen:**
1. It will open a browser window
2. Ask you to login with your Google account (use your Gmail)
3. Ask you to select or create a project

**When it asks "Pick cloud project to use":**
- Choose **"Create a new project"**
- Name it: `nexryde-app`

**When it asks "Do you want to configure a default Compute Region?":**
- Choose: `us-central1` (or any region close to Nigeria like `europe-west1`)

---

### STEP 3: Enable Required APIs (2 minutes)

**In Terminal, run these commands one by one:**

```bash
gcloud services enable run.googleapis.com
```

**Wait for it to finish, then run:**

```bash
gcloud services enable cloudbuild.googleapis.com
```

**What this does:** Turns on Cloud Run and Cloud Build in your Google Cloud account.

---

### STEP 4: Check Your Files Are Ready (1 minute)

**In Terminal, run:**

```bash
cd /Users/admoblord/nexryde/backend
ls -la Dockerfile
```

**You should see:** `Dockerfile` (I already created this for you!)

**If you get "No such file":** Tell me and I'll create it.

---

### STEP 5: Deploy to Cloud Run (10 minutes)

**This is the BIG step! In Terminal, run:**

```bash
cd /Users/admoblord/nexryde/backend

gcloud run deploy nexryde-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10 \
  --min-instances 0 \
  --timeout 300
```

**What will happen:**
1. Cloud Run will ask: **"Do you want to continue (Y/n)?"** → Type `Y` and press Enter
2. It will start building your Docker image (takes 3-5 minutes)
3. You'll see a progress bar
4. When done, it will show you a **URL** like:
   ```
   Service URL: https://nexryde-backend-xxxxx-uc.a.run.app
   ```

**COPY THIS URL!** You'll need it in the next step.

---

### STEP 6: Add Environment Variables (5 minutes)

Your backend needs secrets (MongoDB URL, API keys, etc.). Let's add them:

**Method A: Using Web Console (EASIER)**

1. Go to: https://console.cloud.google.com/run
2. Click on **nexryde-backend**
3. Click **"EDIT & DEPLOY NEW REVISION"** (blue button at top)
4. Click **"VARIABLES & SECRETS"** tab
5. Click **"+ ADD VARIABLE"** and add these one by one:

```
MONGO_URL=YOUR_MONGODB_CONNECTION_STRING
DB_NAME=nexryde_db
GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_KEY_REDACTED
TERMII_API_KEY=TLuufgzYJpodibfqFNFPWbzSWTvLgJzSVWGBKbtIracYRVWTAPjAVSxARPNPJU
TERMII_FROM_ID=NEXRYDE
TERMII_BASE_URL=https://v3.api.termii.com
EMERGENT_AUTH_URL=https://auth.emergentagent.com/session-data
EMERGENT_LLM_KEY=
```

**IMPORTANT:** Replace `YOUR_MONGODB_CONNECTION_STRING` with your real MongoDB URL!

6. Click **"DEPLOY"** at the bottom

---

### STEP 7: Setup MongoDB (Choose One)

You need a database. Pick one:

#### Option A: MongoDB Atlas (FREE Forever - RECOMMENDED)

1. Go to: https://www.mongodb.com/cloud/atlas/register
2. Sign up with your email
3. Choose **"Shared"** (the FREE option)
4. Choose **AWS** as provider
5. Choose region closest to you (e.g., `us-east-1` or `europe-west-1`)
6. Click **"Create Cluster"** (takes 3-5 minutes)
7. When done, click **"Connect"**
8. Choose **"Connect your application"**
9. Copy the connection string (looks like):
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
10. **Go back to Cloud Run console** (Step 6) and paste this as `MONGO_URL`

#### Option B: Keep Your Current MongoDB
If you already have a MongoDB, just use that connection string!

---

### STEP 8: Update Frontend (3 minutes)

Now tell your frontend to use the new Cloud Run backend:

**Open:** `/Users/admoblord/nexryde/frontend/.env`

**Find this line:**
```
EXPO_PUBLIC_BACKEND_URL=https://nexryde-ui.emergent.host
```

**Change it to your new Cloud Run URL:**
```
EXPO_PUBLIC_BACKEND_URL=https://nexryde-backend-xxxxx-uc.a.run.app
```

**Save the file.**

---

### STEP 9: Rebuild Frontend (2 minutes)

**In Terminal, run:**

```bash
cd /Users/admoblord/nexryde/frontend
rm -rf node_modules/.cache .expo
npm start
```

**What this does:** Clears cache and restarts your frontend with the new backend URL.

---

### STEP 10: Test Your App! (2 minutes)

1. Open your Expo app
2. Try to login with phone number
3. Try to book a ride
4. **If everything works:** 🎉 YOU'RE DONE!

---

## 🎉 SUCCESS! WHAT YOU JUST DID:

1. ✅ Deployed backend to Google Cloud Run
2. ✅ Backend now costs **$0/month** with no users
3. ✅ Backend auto-scales when users come
4. ✅ Saved **$100-200/month** immediately!

---

## 💰 YOUR NEW COSTS:

| Service | Cost |
|---------|------|
| **Google Cloud Run** | **$0/month** (with no users) |
| **MongoDB Atlas** | **$0/month** (free tier) |
| **Google Maps API** | **$0/month** (free tier, 100k requests) |
| **Termii SMS** | ~$2-5/month (only when users login) |
| **TOTAL** | **$2-5/month** |

**Old cost on Emergent Pro:** $100-200/month  
**New cost on Cloud Run:** $2-5/month  
**Savings:** $95-195/month! 🎉

---

## ❓ TROUBLESHOOTING

### Problem: "gcloud: command not found"
**Solution:** 
```bash
# Add gcloud to your PATH
echo 'source "/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.bash.inc"' >> ~/.zshrc
source ~/.zshrc
```

---

### Problem: "Permission denied" during deployment
**Solution:**
```bash
gcloud auth login
gcloud config set project nexryde-app
```

---

### Problem: "MongoDB connection failed"
**Solution:** Make sure you:
1. Added your connection string to Cloud Run environment variables
2. In MongoDB Atlas, clicked **"Network Access"** → **"Add IP Address"** → **"Allow Access from Anywhere"** (0.0.0.0/0)
3. Created a database user with password

---

### Problem: "Frontend can't connect to backend"
**Solution:** Double-check:
1. Your `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env` is correct
2. You ran `rm -rf node_modules/.cache .expo && npm start`
3. The Cloud Run URL ends with `.run.app`

---

## 📞 NEED HELP?

If you get stuck at any step, just tell me:
1. Which step number you're on
2. What error message you see
3. I'll help you fix it!

---

## 🎯 NEXT STEPS AFTER THIS:

1. ✅ Test your app thoroughly
2. ✅ Cancel/downgrade Emergent hosting
3. ✅ Monitor your Cloud Run costs (should be $0!)
4. ✅ Launch your app to users!

---

**Ready to start? Begin with STEP 1!**