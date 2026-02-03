# ⚡ QUICK START - FOR EMERGENT

## 🎯 **WHAT YOU NEED TO DO (5 STEPS)**

### **STEP 1: PULL LATEST CODE**
```bash
cd /Users/admoblord/nexryde
git pull origin main
```

### **STEP 2: VERIFY API KEY**
```bash
cd frontend
cat .env
```
**Should see:**
```
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_KEY_REDACTED
```

### **STEP 3: ENABLE GOOGLE APIS**
Go to: https://console.cloud.google.com/apis/library

Enable these 4 APIs:
- ✅ Places API
- ✅ Distance Matrix API
- ✅ Geocoding API
- ✅ Directions API

### **STEP 4: RESTART BACKEND**
```bash
cd backend
pkill -f "uvicorn"
uvicorn server:app --host 0.0.0.0 --port 8000 --reload &
```

### **STEP 5: RESTART FRONTEND**
```bash
cd frontend
npx expo start -c
```

---

## ✅ **TEST CHECKLIST**

Open app → "Book a Ride":

1. **Type "Victoria"** → Should see autocomplete suggestions ✅
2. **Select pickup & destination** → Should calculate distance ✅
3. **See pricing** → Economy ~₦1,600, Premium ~₦3,200 ✅
4. **Check design** → Clean white, no hero images ✅
5. **See voice button** → Floating mic (bottom-right) ✅

---

## 📚 **FULL INSTRUCTIONS**

Read: **`DEPLOYMENT_INSTRUCTIONS_FOR_EMERGENT.md`**
- Complete step-by-step guide
- Troubleshooting
- All documentation links

---

## 🚨 **IF AUTOCOMPLETE NOT WORKING**

1. Enable Places API in Google Cloud Console
2. Check API key in frontend/.env
3. Restart frontend: `npx expo start -c`
4. Test: Type "Victoria" in booking screen

---

## 💰 **KEY INFO**

**Pricing Model:**
- Company takes 0% commission
- Drivers keep 100% of fares
- Dynamic pricing with Google Maps API

**API Costs:**
- ~₦32,000/month (0.35% of revenue)
- Worth it for professional features

---

## 🎉 **WHAT'S NEW**

✅ Google Maps integration (autocomplete, distance, pricing)  
✅ Voice assistant button (demo mode)  
✅ USA standard design (Uber/Lyft style)  
✅ Gmail login fix  
✅ Complete documentation  

---

**Questions? Read `DEPLOYMENT_INSTRUCTIONS_FOR_EMERGENT.md` for complete details!**
