                                                                                                                # Nexryde Production Readiness Audit

Scope: full repo walkthrough (`backend/` FastAPI+Mongo, `frontend/` Expo RN).  
Method: code-path audit only (no assumptions from screen names).  
Date: 2026-04-21.

---

## 1) Authentication & Registration

**State:** Mostly wired end-to-end, but session model is fragmented and some enterprise controls are missing.

**Gaps**
- No password reset flow found in backend auth router (no `forgot/reset password` routes). (`backend/routers/auth.py`)
- JWT secret has insecure production fallback. (`backend/security_advanced.py:30-35`)
- Session model is split across JWT bearer + cookie session table + dual client stores (`SecureStore` + AsyncStorage). (`backend/routers/auth.py:782,1109`, `frontend/utils/authStorage.ts`, `frontend/src/services/persistentAuth.ts`)
- No explicit multi-device session list / forced logout-all for user accounts. (no route found in `backend/routers/auth.py`)

**Severity:** P0 (JWT fallback), P1 (session fragmentation), P1 (no reset flow).

**Fix sketch:** Enforce required `JWT_SECRET` at startup (fail fast), unify to one mobile session store, add password-reset workflow (OTP/email token + revoke sessions endpoint).

---

## 2) Driver Onboarding (KYC)

**State:** Substantially wired backend + frontend, with one response-state mismatch.

**Gaps**
- Docs submission returns `pending_review`, but frontend expects `pending`/`approved` branch semantics. (`backend/routers/drivers.py` doc submit path, `frontend/app/(auth)/driver-documents.tsx`)
- No clear encrypted-at-rest implementation for bank account fields in driver bank flow (plain DB fields inferred from handlers). (`backend/routers/drivers.py`, bank-related routes)
- Background check exists as policy/compliance logic, but no external provider integration path found.

**Severity:** P1.

**Fix sketch:** Normalize verification status enum contract (shared constants), encrypt payout bank fields (KMS-backed), define explicit background-check provider + status mapping.

---

## 3) Rider Profile & Features

**State:** Mixed: profile/wallet/favorites wired; several rider utility features are partial or UI-led.

**Gaps**
- Wallet screen is wired, but still contains legacy UX branches and broad fallback alerts instead of strict financial-state UX for all branches. (`frontend/app/(rider-tabs)/rider-wallet.tsx`)
- Some rider profile features are routed by screen presence but not all have clear backend parity in one place (saved places/split fare/promo require endpoint-by-endpoint cleanup). (`frontend/app/(rider-tabs)/...`, `frontend/src/services/api.ts`)
- Promo flow in wallet is mostly placeholder UX text. (`frontend/app/(rider-tabs)/rider-wallet.tsx:165-175, 515-529`)

**Severity:** P1.

**Fix sketch:** Build rider feature wiring matrix (screen->API->route), remove placeholder promo UX or back it with real entitlement APIs, align error states to deterministic backend statuses.

---

## 4) Driver Features

**State:** Core trip + online/offline + earnings are wired; long-tail “driver lifestyle” modules are uneven.

**Gaps**
- Many driver-facing screens exist but only a subset consume real APIs (high shell risk). (56/101 app screens import API services per scan)
- Leaderboard/challenges/compliance/wellness routes exist, but usage depth is uneven and often single-consumer. (`frontend/src/services/api.ts` single-use exports)
- Some feature surfaces likely cosmetic (fuel/fleet/radio/community variants) pending backend truth-source checks.

**Severity:** P1.

**Fix sketch:** Audit each `(driver)` screen with a strict “live/mock/cosmetic” label and remove/hide non-live modules for launch.

---

## 5) Booking & Trip Lifecycle (Core)

**State:** Fully wired state machine backend with strong transition guards; some model drift exists in frontend legacy helpers.

**Gaps**
- Frontend has stale status enum usage (`in_progress`) while backend canonical state is `ongoing`. (`frontend/src/services/tripsApi.ts`, `backend/routers/trips.py`)
- Need explicit contract test for invalid transition attempts (e.g., pending->completed direct) across all public routes.
- Cancellation-fee policy appears not fully codified as deterministic charge workflow in one path.

**Severity:** P1.

**Fix sketch:** Remove/replace stale `tripsApi.ts` model, add transition contract tests around `trips` endpoints, formalize cancellation-fee debit path with idempotent ledger entries.

---

## 6) Map & Geo

**State:** Core map/geocode services exist and are used, but auth and scaling controls need tightening.

**Gaps**
- Map service routes accept `driver_id` directly without strict ownership enforcement. (`backend/map_service.py`)
- Process-local cache/rate-limits in map layer are weak under horizontal scale. (`backend/map_service.py`)
- Google Maps key is embedded in client binaries. (`frontend/android/app/src/main/AndroidManifest.xml:31`, `frontend/ios/NEXRYDE/Info.plist:37`)

**Severity:** P0 (auth bypass risk), P1 (scale/abuse), P1 (embedded keys, store/security posture).

**Fix sketch:** Require authenticated actor-to-driver binding on all map driver routes, move quotas to shared backend limiter/cache (Redis), keep client keys tightly restricted by bundle/signature and move sensitive geocoding fully server-side.

---

## 7) Safety

**State:** Safety stack is real (SOS, checks, shield, trip records) but indexing/operational hardening is incomplete.

**Gaps**
- Safety high-write collections are not comprehensively indexed in central bootstrap. (`backend/db_indexes.py` lacks explicit indexes for `sos_alerts`, `safety_checks`, `trip_tracking`, etc.)
- Need deterministic SLA path for emergency escalation observability (delivery confirmation for SMS/call chain).
- Shield/dispute and audio are wired, but incident-response runbook linkage is missing.

**Severity:** P1.

**Fix sketch:** Add missing indexes for all safety write/query collections, add delivery-state fields + retry tracking for emergency fanout, publish incident runbook.

---

## 8) Payments & Payouts

**State:** Improved Squad wallet guardrails are in place, but payout/refund and atomicity coverage are still incomplete.

**Gaps**
- Subscription verify failure updates wrong collection in one path (`wallet_payment_intents` vs `subscription_payment_intents`). (`backend/routers/payments.py`, around subscription verify logic)
- `find_one_and_update` CAS is not used in payment claim path; several flows remain read-then-write. (`backend/routers/payments.py`)
- Refund pipeline is not explicit/deterministic as a first-class payment operation. (`backend/routers/support.py`, `backend/routers/payments.py`)
- Amounts are still commonly stored/processed as float NGN in multiple flows; not universally integer kobo. (`backend/routers/payments.py`, wallet fields)
- Driver payout path is “pending settlement” style without robust provider-idempotent disbursement orchestration. (`backend/routers/drivers.py`)

**Severity:** P0 (wrong collection update, non-CAS money path), P1 (refund/payout orchestration), P1 (kobo normalization debt).

**Fix sketch:** Fix collection-target bug immediately; move all settlement claims to atomic CAS + unique idempotency keys; enforce integer-kobo storage migration; implement explicit refund and payout state machines.

---

## 9) Notifications

**State:** Push + in-app notifications are wired, but reliability lifecycle is basic.

**Gaps**
- Push token invalidation/cleanup loop not evident (fire-and-forget style). (`backend/push_notifications.py`)
- In-app notification state transitions are non-versioned (last-write-wins). (`backend/routers/users.py`)
- Need event matrix proving all critical ride/payment milestones trigger pushes consistently.

**Severity:** P1.

**Fix sketch:** Add push receipt processing + token tombstoning, versioned read-state updates, and a tested event->notification dispatch matrix.

---

## 10) Realtime Channel

**State:** Real WebSocket channels exist for rider/driver and chat, with auth checks; multi-connection behavior is weak.

**Gaps**
- Chat connection manager appears single-socket per user overwrite (multi-device risk). (`backend/routers/chat.py`)
- Message timestamp/ordering fields are inconsistent in chat persistence. (`backend/routers/chat.py`)
- Need backpressure/queue depth observability for spike scenarios.

**Severity:** P1.

**Fix sketch:** Support per-user multi-socket set, normalize message schema/time fields, add WS metrics (active conns, lag, drops).

---

## 11) Data Model (MongoDB)

**State:** Broad collection usage and index bootstrap exist; schema governance is mostly code-convention, not validator-enforced.

**Gaps**
- No JSON schema validators observed for core collections (free-form writes risk drift).
- Some expected collections/indexes are implicit in code but not centrally documented (e.g., settlement/refund-oriented aggregates).
- Safety/ops collections need index coverage completion.

**Severity:** P1.

**Fix sketch:** Add schema validators for critical financial/safety/trip collections, publish collection contract doc, close missing index set.

---

## 12) Backend Hardening

**State:** Auth middleware, health/readiness, and CORS exist; route-level abuse controls are incomplete.

**Gaps**
- SlowAPI limiter initialized but route decorators largely absent (effective rate limiting gap). (`backend/rate_limit.py:1-7`, route scans)
- No TrustedHost middleware found. (`backend/server.py`)
- Security headers defined but not globally applied. (`backend/security_advanced.py:463`, no response middleware)
- Global structured logging/tracing and request IDs are limited.

**Severity:** P0 (missing effective limits on payment/OTP/SOS), P1 (host/header hardening).

**Fix sketch:** Add route-level limits for OTP/trip/payment/SOS, enforce trusted hosts, apply security headers globally, add request-id middleware + structured logs.

---

## 13) Mobile Hardening

**State:** Functional app, but release security/crash telemetry posture is not launch-grade.

**Gaps**
- Crash reporting is local console/memory only, no Sentry/Crashlytics sink. (`frontend/src/services/crashReporting.ts:4,12,21`)
- Android release build signs with debug config. (`frontend/android/app/build.gradle:110,115`)
- Release hardening toggles are potentially off by config. (`frontend/android/app/build.gradle:117-118`)

**Severity:** P0 (release signing), P1 (crash telemetry).

**Fix sketch:** Configure production signing keystore, enforce minify/shrink for release, wire Sentry (mobile + backend) with environment tags.

---

## 14) Permissions & Store Readiness

**State:** Core permission strings exist, but manifest is over-permissioned for launch.

**Gaps**
- Android requests sensitive broad permissions not clearly justified for MVP launch:
  - `READ_CONTACTS`, `WRITE_CONTACTS`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`. (`frontend/android/app/src/main/AndroidManifest.xml:8,9,11,15,16`)
- `allowBackup=true` in Android app manifest. (`frontend/android/app/src/main/AndroidManifest.xml:30`)
- Client app bundles include map keys in manifest/plist (expected for SDK but must be tightly restricted). (`AndroidManifest.xml:31`, `Info.plist:37`)

**Severity:** P1.

**Fix sketch:** Remove non-essential dangerous permissions, set `allowBackup=false` for production unless required, enforce strict API key restrictions.

---

## 15) Observability & Ops

**State:** Health endpoints and some operational hooks exist; full production observability stack is incomplete.

**Gaps**
- No clear Sentry/central error aggregation for backend and mobile.
- No explicit metrics/uptime dashboards in repo.
- No documented backup policy or secret rotation runbook found.
- No formal incident runbook for webhook outage / stale locations / DB lag in repo docs.

**Severity:** P1.

**Fix sketch:** Add observability baseline (Sentry + uptime + metrics), document backup/restore + secret rotation, publish incident runbooks.

---

## Launch-Blocker Punch List

| Severity | Area | Gap | File | Effort |
|---|---|---|---|---|
| P0 | Payments | Wrong collection update in subscription verify failure path | `backend/routers/payments.py` | S |
| P0 | Payments | Money claim paths still include read-then-write without CAS-style claim | `backend/routers/payments.py` | M |
| P0 | Backend Hardening | Effective route-level rate limits missing on OTP/payment/trip/SOS | `backend/rate_limit.py`, route files under `backend/routers/` | M |
| P0 | Mobile Hardening | Android release signed with debug config | `frontend/android/app/build.gradle` | S |
| P0 | Security | JWT secret production fallback can boot insecurely | `backend/security_advanced.py` | S |
| P0 | Map/Geo | Driver map service route ownership/auth gap | `backend/map_service.py` | M |
| P1 | Payments | Refund workflow not first-class deterministic flow | `backend/routers/payments.py`, `backend/routers/support.py` | M |
| P1 | Payments/Payouts | Payout settlement orchestration/idempotency incomplete | `backend/routers/drivers.py` | M |
| P1 | Data Model | Universal kobo-int storage not enforced across all money fields | `backend/routers/payments.py` and related docs | L |
| P1 | Realtime | Chat single-connection overwrite and timestamp inconsistency | `backend/routers/chat.py` | M |
| P1 | Safety | Missing indexes on high-write safety collections | `backend/db_indexes.py` | S |
| P1 | Notifications | No push token invalidation/health lifecycle | `backend/push_notifications.py` | M |
| P1 | Store Readiness | Over-permissioned Android manifest | `frontend/android/app/src/main/AndroidManifest.xml` | S |
| P1 | Mobile | No production crash telemetry sink | `frontend/src/services/crashReporting.ts` | S |
| P1 | Auth UX | No password reset flow | `backend/routers/auth.py`, auth screens | M |
| P2 | Ops | Runbooks/backup/rotation docs not codified in repo | `docs/` (missing) | M |

---

## Recommended Attack Order (<= 7 days)

1. **Day 1 (P0 money/security quick wins):** fix wrong-intent collection update, enforce JWT secret fail-fast, enable production signing, lock map-service auth checks.
2. **Day 2-3 (P0 correctness):** refactor payment settlement to CAS-style claim path everywhere; add route-level hard rate limits for OTP/payment/SOS/trip create.
3. **Day 4 (P1 payments):** refund + payout idempotent state machine pass; finalize amount-normalization contract (kobo canonical model plan).
4. **Day 5 (P1 reliability):** realtime chat multi-connection fixes + safety indexes + notification token lifecycle.
5. **Day 6 (store/mobile hardening):** trim Android permissions, set backup policy, wire Sentry mobile+backend.
6. **Day 7 (launch rehearsal):** run end-to-end rider/driver trip + wallet + SOS drills; validate runbook and rollback steps.

