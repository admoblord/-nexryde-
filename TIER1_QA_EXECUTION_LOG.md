# Tier-One QA Execution Log

Execution date: 2026-03-14  
Commit under test: `7eb8a6cc`  
Owner: ____________________

## 0) Automated Evidence (Completed)

- [x] Frontend lint passed (`npm run lint`)
- [x] Backend Python syntax check passed (all `backend/*.py`)
- [x] Fresh Android artifacts exist (AAB + APK)
- [x] Artifact SHA256 fingerprints recorded
- Notes:
  - AAB size: ~72 MB
  - APK size: ~111 MB
  - This section is complete; remaining sections require real-device execution evidence.

## Build Artifacts Under Test

- AAB: `frontend/android/app/build/outputs/bundle/release/app-release.aab`
- AAB SHA256: `3317bfdbc23ce4a3091d1b7865e1b91a6be338a814fed5622fb377f1384ec85e`
- APK: `frontend/android/app/build/outputs/apk/release/app-release.apk`
- APK SHA256: `ece2437d0cd87ae9f6821bb264bf7ddf2cc13ca6968835e1e70d3c2fb09710ce`

## Devices

- Rider device model / OS: ____________________
- Driver device model / OS: ____________________
- App build installed on both devices: [ ] Yes [ ] No
- Push notifications enabled on both: [ ] Yes [ ] No

## 1) Preflight

- [ ] Rider and driver accounts exist and can log in.
- [ ] Driver profile is fully compliant (documents, vehicle, bank details).
- [ ] Both apps installed from target artifact.
- [ ] Backend reachable and push notifications enabled.
- Evidence / notes:

## 2) Network Resilience Matrix

- [ ] Stable Wi-Fi
- [ ] Stable 4G/5G
- [ ] Poor network (airplane toggle / weak signal)
- [ ] Mid-trip network switch (Wi-Fi <-> cellular)
- [ ] No crashes
- [ ] No loading lock > 10s
- [ ] Trip state recovers after reconnect
- Evidence / notes:

## 3) Session & Lifecycle Reliability

- [ ] Login -> force-close -> reopen -> session restored
- [ ] Background 2-5 min during pending trip -> state restored
- [ ] Force-close during `accepted` -> tracking restored
- [ ] Force-close during `arrived` -> code flow intact
- [ ] Force-close during `ongoing` -> tracking active
- [ ] Force-close after completion with pending payment -> receipt state coherent
- Evidence / notes:

## 4) End-to-End Rider -> Driver Acceptance

- [ ] Rider pickup/destination + fare options visible
- [ ] Rider request is received as real offer by driver
- [ ] Driver accepts; rider transitions accepted/arrived
- [ ] Rider sees security code; driver verifies it
- [ ] Driver live face verification required before start
- [ ] Trip starts and tracking shows ongoing
- [ ] Driver can complete once ongoing
- Evidence / notes:

## 5) Payment Reconciliation & Terminal States

- [ ] Pending/completed payment status is correct for cash/transfer
- [ ] Rider receipt view is correct and non-stuck
- [ ] Cancelled trip exits gracefully to home (no stale active banner)
- [ ] Completed trip exits gracefully and appears in history
- Evidence / notes:

## 6) Dispatch Reliability

- [ ] Driver online status survives app refresh/reopen
- [ ] Driver still receives offers after foreground restore
- [ ] Rider timeout does not cancel already accepted trip
- [ ] No test trips visible in driver offers
- Evidence / notes:

## 7) Safety & Trust

- [ ] SOS only works for valid trip participants
- [ ] Trip sharing only works for trip participants
- [ ] Family actions require authenticated owner/member
- [ ] Driver docs stay `pending_review` until admin approval
- Evidence / notes:

## 8) Performance Soak

- [ ] 60+ minute rider session, no crash
- [ ] 60+ minute driver session, no crash
- [ ] Back-to-back trips do not leak stale state
- Evidence / notes:

## 9) Release Gate (Strict)

- [ ] 0 critical defects
- [ ] 0 auth/ownership regressions
- [ ] 0 crashes in rider + driver core flows
- [ ] 0 stuck trip states
- [ ] Fresh artifact generated from current commit
- Final decision: [ ] PASS (ready to upload) [ ] FAIL (fixes required)
- Signoff name / date: ____________________
