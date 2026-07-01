# Finding Driver — Performance Audit & Fix

## Problem

Riders tapped **Request Ride** and waited several seconds before the Finding Driver overlay appeared. The app felt broken compared to Uber/Bolt.

## Root cause (exact file + function)

| Step | File | Function / lines | Blocking? | Typical delay |
|------|------|------------------|-----------|---------------|
| Fare re-lock | `frontend/app/rider/book.tsx` | `findOffers` → `await requestFareEstimate()` | **Yes** | 1–4s |
| Wallet balance | `frontend/app/rider/book.tsx` | `findOffers` → `await getWalletMe()` | **Yes** | 0.5–2s |
| Session refresh | `frontend/app/rider/book.tsx` | `findOffers` → `await ensureFreshAuthSession()` | **Yes** | 0.3–2s |
| Gate code save | `frontend/app/rider/book.tsx` | `findOffers` → `await updateRiderPreferences()` | **Yes** | 0.3–1s |
| Create trip API | `frontend/app/rider/book.tsx` | `findOffers` → `await fetchAuthed(/trips/request)` | **Yes** | 1–5s |
| **Show overlay** | `frontend/app/rider/book.tsx` | `setSearchingForDriver(true)` | Was **after** all above | — |

**Primary delay:** `findOffers()` in `frontend/app/rider/book.tsx` (~2224–2458) awaited every network call before calling `setSearchingForDriver(true)` at line 2436.

**UI component:** `RiderPostRequestOverlay` (`visible={searchingForDriver}`) — not a separate route; overlay visibility was gated on API success.

## Fix applied

1. **Optimistic UI** — `setSearchingForDriver(true)` + countdown run immediately after fast local validation.
2. **Deferred network** — `requestAnimationFrame` then background `submitRideRequest()` for session, fare lock, wallet, gate prefs, and trip create.
3. **Cancel safety** — `searchCancelledRef` aborts in-flight submit if rider cancels before trip id exists.
4. **Perf marks** — `rideRequestPerf` logs `REQUEST_RIDE_BUTTON_CLICKED`, `FINDING_DRIVER_SCREEN_OPENED`, `DRIVER_SEARCH_STARTED`, `FIRST_DRIVER_FOUND`.
5. **Button UX** — Request button no longer shows a loading spinner; overlay is the loading state.

## Target metrics

| Metric | Target | How to verify |
|--------|--------|---------------|
| Click → overlay | **< 200ms** | Dev console `[ride-perf] click → screen` |
| Overlay → search started | < 3s (network) | `[ride-perf] screen → search` |
| Search → first driver | varies | `[ride-perf] search → driver` |

## Remaining non-blocking work (acceptable)

- Route safety fetch (`fetchRouteSafety`) — runs in `useEffect` on coord change, not on button tap.
- Nearby drivers poll — background on book screen mount.
- `pollForDriver` — starts only after trip id returned (correct).

## Recommendations (future)

1. Pre-lock fare on bid change so background submit rarely needs `requestFareEstimate`.
2. Cache wallet balance on wallet tab focus; validate in background only.
3. Save gate code on blur, not on request tap.
4. Consider `InteractionManager.runAfterInteractions` on low-end Android if RAF is insufficient.
