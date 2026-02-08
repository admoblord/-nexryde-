# 🚨 URGENT: Emergent Credit Drain Fix

**Date:** January 30, 2026  
**Problem:** Emergent credit finishing VERY fast  
**Root Cause:** Aggressive polling intervals hitting backend constantly

---

## 💸 THE PROBLEM

Your app has **aggressive polling** that hammers the backend non-stop:

### Current Polling Rates:
- **Bid offers:** Every **3 seconds** ⚠️ (most aggressive!)
- **Driver trips:** Every **10 seconds** ⚠️
- **Heatmap:** Every **60 seconds**
- **Prayer times:** Every **60 seconds**
- **Traffic:** Every **3 minutes**
- **Safety alerts:** Every **5 minutes**

### Cost Impact:
If just **ONE driver** has the app open for 1 hour:
- Trips polling: **360 requests/hour** (every 10 seconds)
- Bid polling: **1,200 requests/hour** (every 3 seconds!)
- Heatmap: **60 requests/hour**
- Prayer: **60 requests/hour**
- **TOTAL: ~1,680 requests/hour PER active driver/rider**

With 10 active users = **16,800 requests/hour** = **403,200 requests/day** 🔥

---

## ✅ IMMEDIATE FIX

### Quick Solution (FOR EMERGENT NOW):

**DISABLE the most aggressive pollers** temporarily:

#### 1. Fix `bid.tsx` (line 77-82):
```typescript
// BEFORE: Every 3 seconds ❌
useEffect(() => {
  if (bidId) {
    const interval = setInterval(fetchOffers, 3000);
    return () => clearInterval(interval);
  }
}, [bidId]);

// AFTER: Every 30 seconds ✅
useEffect(() => {
  if (bidId) {
    const interval = setInterval(fetchOffers, 30000); // 30 sec instead of 3 sec
    return () => clearInterval(interval);
  }
}, [bidId]);
```

#### 2. Fix `trips.tsx` (line 28-32):
```typescript
// BEFORE: Every 10 seconds ❌
useEffect(() => {
  loadPendingTrips();
  const interval = setInterval(loadPendingTrips, 10000);
  return () => clearInterval(interval);
}, []);

// AFTER: Every 60 seconds ✅
useEffect(() => {
  loadPendingTrips();
  const interval = setInterval(loadPendingTrips, 60000); // 60 sec instead of 10 sec
  return () => clearInterval(interval);
}, []);
```

#### 3. Fix `heatmap.tsx` (line 31-35):
```typescript
// BEFORE: Every 60 seconds ❌
useEffect(() => {
  loadHeatmap();
  const interval = setInterval(loadHeatmap, 60000);
  return () => clearInterval(interval);
}, []);

// AFTER: Every 5 minutes ✅
useEffect(() => {
  loadHeatmap();
  const interval = setInterval(loadHeatmap, 5 * 60 * 1000); // 5 min instead of 1 min
  return () => clearInterval(interval);
}, []);
```

---

## 📊 COST REDUCTION

### Before Fix:
- Bid: 1,200 req/hr → **After: 120 req/hr** (10x reduction)
- Trips: 360 req/hr → **After: 60 req/hr** (6x reduction)
- Heatmap: 60 req/hr → **After: 12 req/hr** (5x reduction)

**Total: 1,680 req/hr → ~200 req/hr per user (8x reduction!)**

---

## 🚀 BETTER SOLUTION (LONG-TERM)

### Use WebSocket Instead of Polling:

WebSockets maintain ONE persistent connection instead of making thousands of HTTP requests.

**Benefits:**
- 🟢 Real-time updates (faster than polling!)
- 🟢 99% less backend requests
- 🟢 99% less credit usage
- 🟢 Better battery life for users
- 🟢 Better user experience

**How it works:**
1. App connects ONCE via WebSocket
2. Backend pushes updates when they happen
3. No more polling needed!

---

## 🔧 QUICK DEPLOYMENT

### For Emergent:

```bash
# 1. Edit the 3 files above with new intervals
cd /home/ubuntu/nexryde/frontend/app

# 2. Edit bid.tsx (change 3000 to 30000)
nano rider/bid.tsx

# 3. Edit trips.tsx (change 10000 to 60000)
nano driver/trips.tsx

# 4. Edit heatmap.tsx (change 60000 to 300000)
nano driver/heatmap.tsx

# 5. Rebuild frontend
cd ../..
rm -rf node_modules/.cache .expo
npm start
```

---

## 🎯 RECOMMENDED INTERVALS

### For Polling (if not using WebSocket):

| Feature | Current | Recommended | Reason |
|---------|---------|-------------|--------|
| Bid offers | 3 sec | **30-60 sec** | Drivers need time to respond anyway |
| Pending trips | 10 sec | **60 sec** | Trips don't change that fast |
| Heatmap | 60 sec | **5 min** | Demand zones change slowly |
| Prayer times | 60 sec | **10 min** | Prayer times don't change rapidly |
| Traffic | 3 min | **10 min** | Good as is, or increase |
| Safety alerts | 5 min | **10 min** | Good as is |

---

## 💡 ALTERNATIVE: USER-TRIGGERED REFRESH

Instead of auto-polling, let users **pull to refresh**:

```typescript
// Remove auto-polling
// useEffect(() => {
//   const interval = setInterval(loadData, 10000);
//   return () => clearInterval(interval);
// }, []);

// Add manual refresh button or pull-to-refresh
const onRefresh = useCallback(async () => {
  setRefreshing(true);
  await loadData();
  setRefreshing(false);
}, []);
```

**Users can refresh when they want, not every few seconds!**

---

## 🔍 HOW TO VERIFY FIX WORKED

### Check Backend Logs:

```bash
# Count requests per minute BEFORE fix
tail -f /home/ubuntu/nexryde/backend/backend.log | grep "GET /api" | wc -l

# Count requests per minute AFTER fix
# Should be MUCH lower!
```

### Monitor Credit Usage:
- Check your Emergent dashboard
- After fix, credit should drain 8-10x slower
- Monitor for 1 hour to confirm

---

## ⚠️ WHY THIS HAPPENED

Polling is easy to implement but **very expensive** for:
- Server costs
- API credits (like Emergent)
- Battery life
- Data usage

**WebSocket is the right solution**, but changing intervals NOW gives immediate relief.

---

## 🎯 SUMMARY

### Immediate Fix (DO NOW):
1. Change `bid.tsx` polling: 3 sec → 30 sec
2. Change `trips.tsx` polling: 10 sec → 60 sec
3. Change `heatmap.tsx` polling: 60 sec → 5 min
4. Rebuild frontend

### Expected Result:
- **8-10x less backend requests**
- **8-10x slower credit drain**
- App still works great!

### Long-Term Fix (Later):
- Implement WebSocket for real-time updates
- Remove polling entirely
- 99% cost reduction

---

**Status:** 🔴 URGENT - Fix within 24 hours to save credits!  
**Priority:** 🔥 CRITICAL
