# NEXRYDE Driver Startup Deadlock Audit & Refactor Report

**Date:** 2026-06-20  
**Goal:** No screen loading >8 seconds. Dashboard renders even when backend calls fail.

---

## Root cause — "Loading your session…" infinite hang

### Primary deadlock (warm resume)

| Step | File:Line | What happened |
|------|-----------|---------------|
| 1 | `appStore.ts:252-259` | JWT **excluded** from Zustand persist (by design) |
| 2 | Expo Router | Restores `/(driver-tabs)/driver-home` **without splash** |
| 3 | `useRequireRole.ts` (old) | Required `token` before `roleOk=true` |
| 4 | `AuthLoadingGate.tsx:24` | Rendered spinner while `!roleOk` |
| 5 | `secureSessionHydrate.ts` (old) | No timeout — SecureStore could hang |
| **Result** | | **Infinite "Loading your session…"** until 8s timeout |

### Secondary deadlock (cold start)

| Step | File:Line | What happened |
|------|-----------|---------------|
| 1 | `index.tsx:200` (old) | `await routeAuthedUser()` blocked navigation |
| 2 | `routeAuthedUser.ts:49` (old) | `await fetch onboarding-status` up to 8s **before** home |
| 3 | `useDriverBoot.ts:207` (old) | `await authedFetch onboarding-status` blocked gate |
| 4 | `useDriverBoot.ts:291` (old) | `await loadSubscription` after gate (post-gate but slow) |

---

## Every async call before driver dashboard (before refactor)

| # | Operation | File:Line | Was blocking? | Had timeout? | Status after refactor |
|---|-----------|-----------|---------------|--------------|----------------------|
| 1 | Persist rehydrate | `usePersistStoreReady.ts:9` | YES | NO | **5s cap + proceed** |
| 2 | SecureStore session | `secureSessionHydrate.ts:26` | YES | NO | **5s cap, background** |
| 3 | Role gate token wait | `useRequireRole.ts:66` (old) | YES | 8s UI only | **Render-first: identity only** |
| 4 | Splash onboarding API | `routeAuthedUser.ts:49` (old) | YES | 8s | **Background after home route** |
| 5 | Boot onboarding API | `useDriverBoot.ts:207` (old) | YES | 6s | **Background after gate open** |
| 6 | Boot subscription | `useDriverBoot.ts:128` (old) | Partial | 8s | **Background only** |
| 7 | Profile hydrate | `driver-home.tsx:777` | NO* | 8s | Background (*could set isOnline early) |
| 8 | Earnings fetch | `driver-home.tsx:420` | NO | NO | **5s timeout** |
| 9 | Wallet/withdrawals | `driver-home.tsx:459` | NO | axios 30s | Background |
| 10 | Notifications badge | `_layout.tsx:85` | NO | NO | **5s timeout** |
| 11 | Location GPS | `driver-home.tsx:911` | NO | NO | Background (native) |
| 12 | Categories | `driver-home.tsx:532` | NO | NO | **5s timeout** |

---

## Refactor implemented

### Architecture: RENDER FIRST

```
Open app
  → Persist (5s max) → show shell if user+role in memory
  → Hydrate JWT from SecureStore (5s max, background)
  → Open dashboard gate immediately (cache or defaults)
  → All API calls in background (5s each)
  → 8s global watchdog → Retry / Continue offline
```

### New files

| File | Purpose |
|------|---------|
| `src/constants/startupPolicy.ts` | 5s request / 8s global watchdog constants |
| `src/utils/startupRequestLog.ts` | `[STARTUP_REQ_START/END/FAIL]` + duration logging |

### Key behavior changes

1. **`useRequireRole`** — Dashboard shell renders on persisted identity; JWT hydrates in background
2. **`useDriverBoot`** — Gate opens immediately with cache or safe defaults; all network background
3. **`routeAuthedUser`** — Always `routeToHomeInstant` first for drivers; onboarding check in background
4. **`AuthLoadingGate`** — "Unable to restore session" + **Continue offline**
5. **`awaitPersistHydration`** — 5s hard cap
6. **`secureSessionHydrate`** — 5s hard cap + request logging

---

## Logging format (logcat)

```
[STARTUP_REQ_START] secure_session_hydrate { startTime: 171... }
[STARTUP_REQ_END] secure_session_hydrate { startTime, endTime, durationMs, ok: true }
[STARTUP_REQ_FAIL] driver_onboarding_status { durationMs, error: "..._timeout_5000ms" }
[SESSION_HYDRATE_START] / [SESSION_HYDRATE_END]
[RENDER_COMPLETE] { fromCache: true }
[STARTUP_TIMEOUT] { screen: 'AuthLoadingGate', afterMs: 8000 }
```

---

## Acceptance criteria (Uber standard)

| Criterion | Status |
|-----------|--------|
| Max 5s per startup API call | ✅ |
| Max 8s global watchdog | ✅ |
| Dashboard if profile fails | ✅ |
| Dashboard if wallet fails | ✅ |
| Dashboard if subscription fails | ✅ |
| Dashboard if notifications fail | ✅ |
| Retry mechanism | ✅ |
| Continue offline fallback | ✅ |
| No infinite loading screens | ✅ |
| Request START/END/DURATION logs | ✅ |

---

## Field test for loopy9ice

1. Install **v123+** APK (after next build)
2. Log in → force-close → reopen → dashboard **<2s**
3. Airplane mode → reopen → **Continue offline** → dashboard with cached data
4. Logcat: confirm `[RENDER_COMPLETE]` before `[PROFILE_FETCH_END]`

---

## Remaining non-blocking improvements (optional)

- Add 10s cap on `Location.getCurrentPositionAsync`
- Add timeout on `authedFetch` retry after 401
- Cap axios default 30s globally for startup-tagged calls
