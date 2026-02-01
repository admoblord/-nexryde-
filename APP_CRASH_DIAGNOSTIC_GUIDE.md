# 🚑 APP CRASH DIAGNOSTIC & FIX GUIDE

## **PROBLEM: App showing "Oops! Something went wrong"**

---

## **✅ WHAT WE FIXED (Commit: f058b448)**

### **1. ErrorBoundary Missing Import**
**Issue:** `Platform` was used but not imported  
**Fix:** Added `Platform` to imports  
**Impact:** ErrorBoundary was crashing immediately

### **2. Enhanced Error Logging**
**Added:** Detailed console logging for all errors  
**Shows:** error.message, error.stack, componentStack  
**Purpose:** Identify root cause faster

### **3. Defensive Root Layout**
**Added:** Try-catch wrapper in _layout.tsx  
**Fallback:** Shows error screen if root crashes  
**Purpose:** Prevent complete app freeze

### **4. Safe Store Access**
**Added:** Error handling for useAppStore()  
**Fallback:** Retry button if store fails  
**Purpose:** Graceful handling of store errors

---

## **🔍 HOW TO DIAGNOSE THE CURRENT ERROR**

### **Step 1: Check Console Logs**

Run the app and look for these console messages:

```
🚨 ErrorBoundary caught an error: [ERROR MESSAGE]
📋 Specific error: [DETAILED MESSAGE]
Error stack: [STACK TRACE]
Component stack: [COMPONENT PATH]
```

**Key things to look for:**
- `Cannot find module` → Missing dependency
- `undefined is not an object` → Null/undefined access
- `Network request failed` → Backend connection issue
- `SecureStore` → Storage permission issue
- `useAppStore` → State management issue

---

### **Step 2: Common Issues & Solutions**

#### **Issue 1: Missing Dependencies**
**Error:** `Cannot find module '@react-native-async-storage/async-storage'`

**Fix:**
```bash
cd frontend
npm install @react-native-async-storage/async-storage
npm install expo-secure-store
npm install zustand
```

#### **Issue 2: Expo Modules Not Synced**
**Error:** `expo-secure-store` or similar Expo modules failing

**Fix:**
```bash
cd frontend
npx expo install expo-secure-store
npx expo prebuild --clean
```

#### **Issue 3: Backend Connection**
**Error:** `Network request failed`

**Fix:**
1. Check `EXPO_PUBLIC_BACKEND_URL` in `.env`
2. Verify backend is running
3. Test: `curl https://nexryde-ui.emergent.host/api/health`

#### **Issue 4: First Time Install - Storage**
**Error:** SecureStore fails on first app launch

**Fix:** Already handled! App should show splash screen

#### **Issue 5: Corrupted App State**
**Error:** App crashes on specific screens

**Fix:**
```bash
# Clear app data
# On Android: Settings → Apps → NexRyde → Clear Data
# On iOS: Delete app and reinstall
```

---

### **Step 3: Test Each Screen Independently**

If app crashes, test navigation to identify the problematic screen:

**Safe Screens (Should work):**
- ✅ Splash screen (index.tsx)
- ✅ Login (login.tsx)
- ✅ Register (register.tsx)

**Screens to test:**
1. Open app
2. Login with phone
3. Navigate to home
4. Click each menu item
5. Test driver/rider switching

**Record which screen causes the crash!**

---

## **🛠️ EMERGENCY FIX CHECKLIST**

If app still crashes after pulling latest code:

### **1. Clear Everything**
```bash
cd frontend
rm -rf node_modules
rm -rf .expo
rm package-lock.json
npm install
```

### **2. Verify Environment**
```bash
# Check .env file exists
cat .env

# Should contain:
EXPO_PUBLIC_BACKEND_URL=https://nexryde-ui.emergent.host/api
```

### **3. Rebuild App**
```bash
cd frontend
npx expo start --clear
```

### **4. Check Expo Go Version**
- Update Expo Go app on phone
- Should be latest version from Play Store/App Store

### **5. Test on Different Device**
- Try on another phone
- Try on Android Studio emulator
- Try on iOS simulator

---

## **📱 WHAT TO TELL USER**

If users report crashes:

### **For Users:**
1. "Try Again" button should recover most errors
2. If persists: Close app completely and reopen
3. If still fails: Clear app data or reinstall
4. Update to latest version

### **For Developers:**
1. Check console logs for error details
2. Test on physical device (not just simulator)
3. Verify all dependencies installed
4. Check backend is accessible
5. Look for platform-specific issues (Android vs iOS)

---

## **🚀 DEPLOYMENT CHECKLIST**

Before deploying:

✅ All commits pushed to GitHub  
✅ Backend is running and accessible  
✅ Environment variables set correctly  
✅ All dependencies installed  
✅ App tested on physical device  
✅ ErrorBoundary shows helpful messages  
✅ "Try Again" button works  
✅ No console errors on clean install  

---

## **📊 CURRENT STATUS**

**Last Commit:** f058b448  
**Status:** ErrorBoundary fixed + Enhanced error handling  
**Known Issues:** TBD (need console logs to diagnose)  

**Next Steps:**
1. Pull latest code
2. Clear cache and rebuild
3. Test on device
4. Check console logs for specific error
5. Report error message back

---

## **💬 WHAT TO TELL EMERGENT**

```
CRITICAL UPDATE - PULL NOW

Commit: f058b448

Fixed:
✅ ErrorBoundary Platform import
✅ Enhanced error logging
✅ Root layout fallback
✅ Store error handling

Actions needed:
1. git pull origin main
2. cd frontend && npm install (verify all deps)
3. npx expo start --clear
4. Test app on device
5. Check console logs if crash occurs
6. Report specific error message

Expected result:
✅ App opens without immediate crash
✅ If error occurs, shows specific message in console
✅ ErrorBoundary shows "Try Again" button
✅ User can recover from errors

If still crashing:
→ Send console log output
→ Specify which screen crashes
→ Note: Android or iOS?
→ Note: Real device or emulator?
```

---

## **🔍 DEBUG MODE**

To enable maximum debug info:

**In frontend/app/_layout.tsx:**
- Check console for "🚨 CRITICAL ERROR IN ROOT LAYOUT"

**In frontend/app/index.tsx:**
- Check console for "🚨 STORE ACCESS ERROR"

**In frontend/src/components/ErrorBoundary.tsx:**
- Check console for "🚨 ErrorBoundary caught an error"
- Look for "📋 Specific error:" line

**All errors now logged with full stack trace!**

---

**STATUS: READY FOR TESTING** ✅  
**NEXT: Get console logs to identify specific issue**
