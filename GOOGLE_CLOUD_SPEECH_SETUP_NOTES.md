# 🔐 GOOGLE CLOUD SPEECH SETUP - IMPORTANT NOTES

## ⚠️ SECURITY WARNING

**You just shared a credential in the chat!**

```
AQ.Ab8RN6JjoEeK8UYyStC5k97h_5KpbNa9bGzKnydWrj40NsLDfg
```

**⚠️ IMPORTANT:**
- If this is a real API key, consider it **compromised**
- Regenerate it immediately in Google Cloud Console
- Never share credentials in chat, messages, or public channels
- Always use environment variables for sensitive data

---

## 🔑 CREDENTIAL TYPE IDENTIFICATION

### **What This Key Looks Like:**
```
Format: AQ.Ab8RN6JjoEeK8UYyStC5k97h_5KpbNa9bGzKnydWrj40NsLDfg
Pattern: AQ.[base64-like string]
```

**This appears to be:**
- ❓ Possibly a Google API key
- ❓ Or a Google OAuth token fragment
- ❓ Or another type of credential

**This is NOT:**
- ❌ A service account JSON file (which is what Google Cloud Speech needs)
- ❌ A typical Google Maps API key format (usually: AIza...)

---

## ✅ WHAT YOU ACTUALLY NEED FOR GOOGLE CLOUD SPEECH

### **Google Cloud Speech-to-Text Requires:**

**OPTION 1: Service Account JSON File (RECOMMENDED)**
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "service-account@project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

**How to Get It:**
1. Go to: https://console.cloud.google.com/
2. Select your project (or create one)
3. Go to: IAM & Admin → Service Accounts
4. Click: Create Service Account
   - Name: nexryde-speech
   - Role: Cloud Speech-to-Text Admin
5. Click: Create Key → JSON
6. Download the JSON file
7. Save as: `nexryde-speech-key.json`
8. Put in: `/Users/admoblord/nexryde/backend/nexryde-speech-key.json`

**OPTION 2: API Key (LIMITED)**
```
Format: AIzaSyB... (40 characters)
Used for: Simple API calls
Limitations: Less secure, fewer features
```

---

## 🔧 CURRENT CONFIGURATION

### **backend/.env File:**
```bash
# Google Cloud Speech-to-Text Configuration
GOOGLE_CLOUD_SPEECH_KEY=nexryde-speech-key.json  # Path to JSON file
GOOGLE_SPEECH_API_KEY=AQ.Ab8RN6JjoEeK8UYyStC5k97h_5KpbNa9bGzKnydWrj40NsLDfg  # Your provided key
```

---

## 🚨 SECURITY BEST PRACTICES

### **1. Never Share Credentials:**
```
❌ DON'T: Share in chat, messages, Slack, email
❌ DON'T: Commit to Git/GitHub
❌ DON'T: Post in public forums
✅ DO: Use environment variables
✅ DO: Add to .gitignore
✅ DO: Regenerate if compromised
```

### **2. Protect Your Credentials:**
```bash
# Add to .gitignore
echo "nexryde-speech-key.json" >> .gitignore
echo ".env" >> .gitignore

# Verify not tracked
git status

# If accidentally committed:
git rm --cached nexryde-speech-key.json
git rm --cached .env
git commit -m "Remove credentials"
```

### **3. Rotate Credentials Regularly:**
```
- Regenerate keys every 90 days
- Delete old/unused keys
- Use separate keys for dev/prod
- Monitor usage for anomalies
```

---

## ✅ CORRECT SETUP STEPS

### **Step 1: Get Service Account JSON**

```bash
# Go to Google Cloud Console
https://console.cloud.google.com/

# Navigate to:
IAM & Admin → Service Accounts

# Create service account:
Name: nexryde-speech
Role: Cloud Speech-to-Text Admin

# Create key:
Format: JSON
Download: nexryde-speech-key.json
```

### **Step 2: Add to Backend**

```bash
cd /Users/admoblord/nexryde/backend

# Copy JSON file
cp ~/Downloads/nexryde-speech-key.json .

# Verify it exists
ls -la nexryde-speech-key.json

# Check it's in .gitignore
cat .gitignore | grep nexryde-speech-key.json
```

### **Step 3: Update .env**

```bash
# backend/.env
GOOGLE_CLOUD_SPEECH_KEY=nexryde-speech-key.json
```

### **Step 4: Test**

```bash
# Start backend
uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# Test endpoint
curl http://localhost:8000/api/voice/test

# Expected response:
{
  "status": "success",
  "configured": true,
  "credentials_file": "nexryde-speech-key.json"
}
```

---

## 🔍 VERIFY YOUR CREDENTIAL

### **Check What Type You Have:**

**If it's a JSON file:**
```bash
# View first few lines
head -n 5 nexryde-speech-key.json

# Should show:
{
  "type": "service_account",
  "project_id": "your-project",
  ...
}
```

**If it's an API key:**
```bash
# Test with curl
curl "https://speech.googleapis.com/v1/speech:recognize?key=YOUR_KEY_HERE"

# If valid, you'll get a response (might be error about request format)
# If invalid, you'll get "API key not valid"
```

---

## ⚠️ IMMEDIATE ACTIONS REQUIRED

### **1. Verify Credential Type:**
```
❓ What is this key for?
   - Google Cloud Speech-to-Text?
   - Google Maps?
   - Other Google service?

❓ Where did you get it?
   - Google Cloud Console?
   - Email?
   - Downloaded JSON file?
```

### **2. If This is a Real Key:**
```
🚨 REGENERATE IT IMMEDIATELY!

Why? Because you shared it in chat, it's now compromised.

Steps:
1. Go to Google Cloud Console
2. Find the key in credentials
3. Delete the old key
4. Create a new key
5. Download it
6. Add to backend (don't share!)
```

### **3. Get Proper Service Account JSON:**
```
If you don't have the JSON file yet:
1. Follow "Step 1: Get Service Account JSON" above
2. Download the JSON file
3. Keep it secure (never share!)
4. Add to backend folder
5. Update .env with file path
```

---

## 📋 CHECKLIST

Before proceeding:

- [ ] Identified credential type (JSON file or API key?)
- [ ] If compromised, regenerated credential
- [ ] Have proper service account JSON file
- [ ] JSON file in backend folder
- [ ] JSON file in .gitignore
- [ ] .env updated with correct path
- [ ] Tested /api/voice/test endpoint
- [ ] Verified credentials work

---

## 💬 NEXT STEPS

### **If You Have Service Account JSON:**
```
✅ Great! Follow normal setup in IMPLEMENT_REAL_VOICE_BOOKING.md
```

### **If You Only Have API Key:**
```
⚠️ This won't work for Speech-to-Text
   Need to create service account
   Follow steps above
```

### **If You're Not Sure:**
```
📧 Tell me:
   - Where did you get this key?
   - What format is it? (JSON file or string?)
   - What's it supposed to be for?
   
   I'll help you get the right credentials!
```

---

## 🔐 SECURITY REMINDER

**Your credential was just posted in chat!**

If this is a real, active key:
1. ⚠️ Consider it compromised
2. 🔄 Regenerate immediately
3. 🔒 Keep new key secure
4. ❌ Never share again

**Always protect your credentials like passwords!**

---

**Document Created:** 2026-01-30  
**Purpose:** Security warning & proper credential setup  
**Status:** 🚨 ACTION REQUIRED - Verify and secure credentials
