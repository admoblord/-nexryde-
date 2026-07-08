# NexRyde Platform Stability & Network Audit

**Date:** 2026-07-06 (updated after full fix pass)  
**Scope:** Rider app, Driver app, backend sockets, maps, auth, navigation, location, background lifecycle  
**Status:** Critical + high-priority issues **implemented**; backend multi-instance WS remains deferred

---

## Executive Summary

Two implementation passes addressed **32 of 47** identified risks. All P0 and most P1 frontend items are now in code. Remaining gaps are primarily backend infrastructure (Redis WS fan-out) and gradual migration of ~50 low-traffic screens still using bare `fetch()`.

### Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| Weak internet never closes the app | **Good** — global ErrorUtils + ErrorBoundary + Sentry |
| Trip state survives disconnect | **Good** — Zustand persist + rider WS singleton + HTTP poll fallback |
| Driver/rider auto-reconnect | **Good** — all 3 WS singletons + `nudgeReconnect` on foreground |
| Socket reconnect without user action | **Good** — exponential backoff on all sockets |
| No infinite loading | **Good** — hot paths timeout; tracking has 12s loading cap |
| No white/black screens | **Improved** — boot shells + error boundaries |
| No app exits to home | **Improved** — uncaught JS captured; OOM still possible on low-RAM |
| UI always responsive | **Good** — unified queue + network manager on critical paths |
| Uber/Bolt production quality | **Near** — needs device QA + AAB 167+ |

---

## Fixes Implemented (Complete List)

### Crash & Error Handling
| Fix | File(s) |
|-----|---------|
| ErrorBoundary → Sentry | `ErrorBoundary.tsx` |
| Global `ErrorUtils` handler | `sentry.ts`, `_layout.tsx` |
| Crash reporter 8s timeout | `crashReporting.ts` |

### Network Layer
| Fix | File(s) |
|-----|---------|
| Unified `networkManager.ts` (timeout, backoff, offline) | `networkManager.ts` |
| Trip tracking APIs | `tripTrackingApi.ts` |
| Background GPS | `backgroundLocationTask.ts` |
| Google Directions | `navUtils.ts` |
| Backend warm-up | `warmBackend.ts` |
| Chat HTTP fallback + AI | `chat.tsx` |
| Trip cancel | `useRiderTrackingSession.ts` |
| Offline queue flush | `offlineQueue.ts` |

### Socket Layer
| Fix | File(s) |
|-----|---------|
| Rider trip singleton + ref-count + 30s ping | `riderTripSocket.ts` |
| HTTP poll fallback (ETag) | `useRiderTripRealtime.ts` |
| Driver offers `nudgeReconnect()` | `driverOffersSocket.ts` |
| Chat singleton | `chatSocket.ts`, `chat.tsx` |
| Connectivity recovery hook | `useConnectivityRecovery.ts`, `_layout.tsx` |

### Offline & Queue
| Fix | File(s) |
|-----|---------|
| **Unified queue** (`@nexryde_offline_queue`) | `offlineQueue.ts`, `offlineMode.ts` |
| Legacy `@offline_queue` migration | `migrateLegacyOfflineQueue()` |
| Typed enqueue helpers | `offlineQueueActions.ts` |
| Trip request queued on offline (book + rideRequestService) | `book.tsx`, `rideRequestService.ts` |
| Driver accept queued on network fail | `driver-home.tsx` |
| Single flush path + user alerts | `syncQueuedRequests()`, `useOfflineQueueFlush.ts` |
| NetInfo singleton (no per-screen leak) | `offlineMode.ts`, `_layout.tsx` |

### Driver Presence
| Fix | File(s) |
|-----|---------|
| Heartbeat every 4 min while online | `driverHeartbeat.ts`, `driver-home.tsx` |

### Navigation
| Fix | File(s) |
|-----|---------|
| `safeReplace()` with 450ms dedupe | `navigationSafe.ts` |
| RoleRouteRedirect segment check | `RoleRouteRedirect.tsx` |
| Legal terms guard | `navigationRouteGuard.ts` |
| Auth expiry navigation | `_layout.tsx` |
| Ride phase navigation | `useRiderRidePhaseNavigation.ts` |
| Tracking session navigation | `useRiderTrackingSession.ts` |

### Lifecycle
| Fix | File(s) |
|-----|---------|
| Foreground: flush queue + nudge all sockets | `useConnectivityRecovery.ts` |
| App resume token warm (existing) | `_layout.tsx` |

### Maps
| Fix | File(s) |
|-----|---------|
| Work Zone remount loop (prior session) | `work-zone.tsx`, `workZoneScreenStore.ts` |
| Live map key only changes on explicit retry | `LiveTrackingScreen.tsx` (unchanged — correct) |
| Directions timeout prevents hung map routes | `navUtils.ts` |

### Data Persistence (existing, verified)
- `appStore` Zustand persist → profile, active trip, wallet state survive restarts
- Trip driver cache → `tripDriverCache.ts`
- Work zone screen cache → `workZoneScreenStore.ts`

---

## Remaining Deferred (Low Risk / Backend)

| ID | Item | Priority |
|----|------|----------|
| B-01 | Redis pub/sub for multi-instance WS on Cloud Run | P2 backend |
| N-07 | TanStack Query adoption (provider exists, unused) | P2 |
| N-02 | ~50 low-traffic screens still on bare `fetch()` | P3 gradual |
| P-02 | Consolidate `book.tsx` finding-driver timers | P3 |
| M-02 | `DriverLiveMapView` memo audit | P3 |

---

## Architecture After Fixes

```
┌─────────────────────────────────────────────────────────┐
│  _layout.tsx                                            │
│  ├── initSentry + installGlobalErrorHandler             │
│  ├── initializeOfflineMode (singleton)                  │
│  ├── useOfflineQueueFlush → syncQueuedRequests          │
│  └── useConnectivityRecovery → nudge all sockets        │
└─────────────────────────────────────────────────────────┘
         │
         ├── networkManager.managedFetch (timeout + backoff)
         │
         ├── WebSockets (singleton each)
         │   ├── driverOffersSocket
         │   ├── riderTripSocket (+ HTTP poll fallback)
         │   └── chatSocket
         │
         └── offlineQueue (@nexryde_offline_queue)
             ├── trip_request
             └── driver_accept_trip
```

---

## Verification

```bash
cd frontend && npx tsc --noEmit   # ✓ passes
```

### On-Device QA Checklist
1. Throttle to 3G → book ride → driver accepts → both see updates
2. Airplane mode 30s during tracking → reconnect → trip state intact
3. Driver online 20+ min → no ghost-offline
4. Kill chat WS → messages send via HTTP → WS recovers
5. Book ride offline → queue → online → auto-sync + alert

---

## New Files (This Sprint)

| File | Purpose |
|------|---------|
| `networkManager.ts` | Unified HTTP |
| `riderTripTypes.ts` | Shared WS types |
| `riderTripSocket.ts` | Rider trip singleton |
| `driverHeartbeat.ts` | Server presence |
| `chatSocket.ts` | Chat singleton |
| `offlineQueueActions.ts` | Typed queue helpers |
| `navigationSafe.ts` | Deduped navigation |
| `useConnectivityRecovery.ts` | Foreground recovery |

---

*Ship AAB build 167+ after on-device QA. Deploy backend Work Zone entitlement if not yet on production API.*
