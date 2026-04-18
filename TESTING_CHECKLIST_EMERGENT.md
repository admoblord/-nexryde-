# 🧪 TESTING CHECKLIST FOR EMERGENT

**After deployment, run these tests to verify everything works:**

---

## 1️⃣ BACKEND HEALTH CHECK

```bash
curl http://localhost:8000/health
```

**Expected:**
```json
{"status": "healthy"}
```

❌ **If fails:** Backend not running. Check logs:
```bash
tail -50 /home/ubuntu/nexryde/backend/backend.log
```

---

## 2️⃣ SMS OTP ENDPOINT TEST

```bash
curl -X POST http://localhost:8000/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+2348012345678"}' \
  -i
```

**Expected Response:**
- ✅ Status: `HTTP/1.1 200 OK`
- ✅ Header: `content-type: application/json`
- ✅ Body: Valid JSON like:
```json
{
  "success": true,
  "message": "OTP sent successfully via SMS",
  "expires_in_minutes": 10,
  "provider": "termii"
}
```

❌ **If you see HTML (`<!DOCTYPE html>`) instead of JSON:** Backend not fixed properly.

---

## 3️⃣ GOOGLE AUTH ENDPOINT TEST

```bash
curl -X POST http://localhost:8000/api/auth/google/exchange \
  -H "Content-Type: application/json" \
  -d '{"session_id": "test123"}' \
  -i
```

**Expected Response:**
- ✅ Status: `HTTP/1.1 401 Unauthorized` or `503 Service Unavailable`
- ✅ Header: `content-type: application/json`
- ✅ Body: Valid JSON like:
```json
{
  "success": false,
  "message": "Session expired or invalid. Please sign in again.",
  "error": "..."
}
```

❌ **If you see HTML:** Backend not fixed properly.

---

## 4️⃣ REGISTRATION ENDPOINT TEST

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+2348012345678",
    "name": "Test User",
    "role": "driver"
  }' \
  -i
```

**Expected Response:**
- ✅ Status: `HTTP/1.1 200 OK` or `400 Bad Request`
- ✅ Header: `content-type: application/json`
- ✅ Body: Valid JSON (success or error)

---

## 5️⃣ BACKEND LOGS CHECK

```bash
tail -50 /home/ubuntu/nexryde/backend/backend.log
```

**Look for:**
- ✅ `✅ Termii SMS sent successfully` (if OTP sent)
- ✅ No Python errors or tracebacks
- ✅ Requests completing successfully

❌ **Red flags:**
- Python errors/exceptions
- "No Route" errors from Termii (contact Termii support)
- JSON encoding errors

---

## 6️⃣ POLLING REDUCTION CHECK

```bash
# Watch requests in real-time for 60 seconds
timeout 60 tail -f /home/ubuntu/nexryde/backend/backend.log | grep -E "GET|POST"
```

**Expected:**
- ✅ Requests are spaced out (not every 3 seconds)
- ✅ You should see requests every 30-60 seconds, not constantly

❌ **If still seeing requests every 3-10 seconds:** Frontend not rebuilt properly.

---

## 7️⃣ FRONTEND CHECK

```bash
cd /home/ubuntu/nexryde/frontend

# Check if Expo is running
ps aux | grep expo

# Check frontend logs
# (Wherever Expo outputs logs)
```

**Expected:**
- ✅ Expo dev server running
- ✅ No errors about missing modules
- ✅ App accessible via Expo Go

---

## 8️⃣ DEVICE TESTING (Critical!)

### Test 1: SMS Login
1. Open app on device
2. Tap "Login with SMS"
3. Enter phone: `8012345678`
4. Tap "Continue"
5. **Expected:** ✅ No "JSON parse error"
6. **Expected:** ✅ SMS arrives with OTP code
7. Enter OTP
8. **Expected:** ✅ Login successful

❌ **If JSON parse error:** Backend returning HTML instead of JSON

### Test 2: Google Login
1. Open app
2. Tap "Continue with Google"
3. Complete Google sign-in
4. **Expected:** ✅ No "Can't sign in" error
5. **Expected:** ✅ Navigate to registration or home

### Test 3: Driver Registration
1. Complete registration
2. Select "Driver" role
3. Tap "Continue"
4. **Expected:** ✅ Navigate to Driver Home screen (not stuck)

### Test 4: Bid Polling (Credit Drain Check)
1. Go to Rider → "Bid for Ride"
2. Create a bid
3. Watch for 60 seconds
4. **Expected:** ✅ Offers refresh every 30 seconds (not every 3 seconds)

---

## 9️⃣ CREDIT USAGE MONITORING

Check your Emergent dashboard:
- **Before fix:** Credit draining fast
- **After fix (1 hour later):** Credit draining 8-10x slower

---

## 🔟 TERMII SMS BALANCE

```bash
curl -X GET "https://v3.api.termii.com/api/get-balance?api_key=<REDACTED_TERMII_API_KEY>"
```

**Expected:**
```json
{
  "balance": 8748.63,
  "currency": "NGN"
}
```

---

## ✅ SUCCESS CRITERIA

All these must pass:

- [ ] Backend health check returns JSON
- [ ] OTP endpoint returns JSON (not HTML)
- [ ] Google auth endpoint returns JSON (not HTML)
- [ ] Registration endpoint returns JSON
- [ ] Backend logs show no errors
- [ ] Polling reduced (not every 3-10 seconds)
- [ ] SMS login works on device (no JSON parse error)
- [ ] Google login works on device
- [ ] Driver registration navigates correctly
- [ ] Credit usage reduced by 8-10x (check after 1 hour)

---

## 🚨 COMMON ISSUES

### Issue 1: Still seeing "JSON parse error"
**Cause:** Backend not restarted properly
**Fix:**
```bash
pkill -f uvicorn
cd /home/ubuntu/nexryde/backend
nohup uvicorn server:app --host 0.0.0.0 --port 8000 --reload > backend.log 2>&1 &
```

### Issue 2: Still seeing aggressive polling
**Cause:** Frontend not rebuilt
**Fix:**
```bash
cd /home/ubuntu/nexryde/frontend
rm -rf node_modules/.cache .expo
pkill -f expo
npm start
```

### Issue 3: SMS not arriving
**Cause:** Termii "No Route" error
**Fix:** Contact support@termii.com to activate SMS routing
**Workaround:** Check backend logs for OTP code (test mode)

### Issue 4: Backend won't start
**Check:**
```bash
cd /home/ubuntu/nexryde/backend
python3 -m uvicorn server:app --host 0.0.0.0 --port 8000
# (Run in foreground to see errors)
```

---

## 📊 FINAL REPORT

After testing, report back:

```
✅ Backend health: [PASS/FAIL]
✅ OTP returns JSON: [PASS/FAIL]
✅ Google auth returns JSON: [PASS/FAIL]
✅ SMS login on device: [PASS/FAIL]
✅ Google login on device: [PASS/FAIL]
✅ Driver navigation: [PASS/FAIL]
✅ Polling reduced: [PASS/FAIL]
✅ Credit usage reduced: [PASS/FAIL - check after 1 hour]

Issues found: [NONE / LIST ISSUES]
```

---

**All tests must pass!** If any fail, report which one and send the error message.
