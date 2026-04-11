# Tier-One Release Checklist

Use this checklist on two real devices (one rider account, one driver account).

## 1) Preflight

- [ ] Rider and driver accounts exist and can log in.
- [ ] Driver profile is fully compliant (documents, vehicle, bank details).
- [ ] Both apps installed from the target artifact (APK/AAB build under test).
- [ ] Backend reachable and push notifications enabled.

## 2) Network Resilience Matrix

Run each scenario on both rider and driver devices:

- [ ] Stable Wi-Fi
- [ ] Stable 4G/5G
- [ ] Poor network (toggle airplane mode on/off, weak signal area)
- [ ] Network switch mid-trip (Wi-Fi <-> cellular)

Pass criteria:

- [ ] No crashes
- [ ] No infinite loading state over 10 seconds
- [ ] Trip state always recovers after reconnect

## 3) Session & Lifecycle Reliability

- [ ] Login with email/OTP, fully close app, reopen -> session restored.
- [ ] Background app for 2-5 minutes during pending trip -> state restored.
- [ ] Force close app during `accepted` trip -> reopen -> tracking restored.
- [ ] Force close app during `arrived` trip -> reopen -> security code flow intact.
- [ ] Force close app during `ongoing` trip -> reopen -> tracking still active.
- [ ] Force close app after completion with pending cash/transfer status -> receipt/payment state coherent.

## 4) End-to-End Rider -> Driver Acceptance Flow

- [ ] Rider selects pickup/destination and receives fare options.
- [ ] Rider requests trip and driver receives real offer.
- [ ] Driver accepts offer; rider transitions to accepted/arrived states.
- [ ] Rider security code is shown to rider; driver verifies code.
- [ ] Driver live face verification required before start.
- [ ] Trip starts and rider tracking reflects ongoing state.
- [ ] Driver can complete trip once ongoing.

## 5) Payment Reconciliation & Terminal States

- [ ] Cash/transfer trip completion shows correct pending/completed payment status.
- [ ] Rider sees receipt view without stuck status.
- [ ] Cancelled trip route exits gracefully to home (no stale active trip banner).
- [ ] Completed trip exits gracefully and remains in trip history.

## 6) Dispatch Reliability

- [ ] Driver online status survives app refresh/reopen.
- [ ] Driver continues receiving offers after foreground restore.
- [ ] Rider timeout does not cancel an already accepted trip.
- [ ] No test trips appear in driver offers.

## 7) Safety & Trust

- [ ] SOS trigger works for valid trip participants only.
- [ ] Trip sharing works for trip participants only.
- [ ] Family actions require authenticated owner/member permissions.
- [ ] Driver document submission ends in pending review (not auto-approved).

## 8) Performance Soak (Long Session)

- [ ] 60+ minute rider session without crash.
- [ ] 60+ minute driver session without crash.
- [ ] Multiple back-to-back trips do not leak stale state.

## 9) Release Gate (Strict)

Ship only when all are true:

- [ ] 0 critical defects
- [ ] 0 auth bypass/ownership regressions
- [ ] 0 crash defects in rider and driver main flows
- [ ] 0 stuck trip states
- [ ] Fresh artifact generated from current commit
