# Device-lab chaos checklist — NexRyde Reliability

Manual / device-farm scenarios. Backend chaos is automated in
`backend/tests/chaos/` (release gate + realtime chaos).

## Prep

1. Driver phone on Android 13+ with battery optimization ignored for NEXRYDE.
2. Staging backend with `NEXRYDE_REALTIME_PLATFORM=true`.
3. In another terminal:

```bash
export NEXRYDE_API_BASE=https://<staging-host>
export NEXRYDE_TOKEN='Bearer <driver-jwt>'
python3 backend/scripts/watch_realtime_metrics.py --interval 10
```

Watch: `fare.estimate_io_ms`, `places.autocomplete_ms`, `push.missed_offer`,
`saga.*`, `trip.cancel_ms`, `redis_latency_ms`, `delivery_guarantee.*`,
`device_health.*`.

## Scenarios

| # | Scenario | Steps | Pass criteria |
|---|----------|-------|----------------|
| 1 | **Doze** | Go online → lock screen 10m → rider requests | Full-screen alert wakes; ACK within 5s; no `push.missed_offer` spike |
| 2 | **Airplane** | Online → airplane 30s → off airplane | Heartbeat FORCE_OFFLINE reconcile or auto re-online; heal replay; no ghost GEO |
| 3 | **Wi‑Fi ↔ LTE** | Toggle airplane/Wi‑Fi mid-offer countdown | Offer stays; accept still exactly-once; socket reconnects |
| 4 | **FGS kill** | Force-stop FGS from ADB / battery → wait sticky restart | Boot/`was_online` restores listening; heal runs; offers still deliver via FCM |
| 5 | **Kill mid-trip** | Force-stop app during ongoing trip | Recover restores trip; no orphan lock forever |
| 6 | **100 concurrent offers** | Load script or chaos test | Exactly-once FCM claims; accept storm = 1 winner (`pytest tests/chaos`) |
| 7 | **Cloud Run revision swap** | Deploy new revision at 100% while drivers online | `/api/realtime/health` redis_ok; heal on foreground; no stuck trip locks |
| 8 | **Redis restart** | Restart Memorystore / local Redis | Heal reconnects; presence re-seeded; no lost terminal outcomes |
| 9 | **Cancel offline** | Start cancel → kill network mid-request | UI queues cancel; sync on reconnect; no double cancel penalty |
| 10 | **Complete offline** | End trip → airplane before ACK | `queueDriverComplete` drains; saga completes; no double earnings |
| 11 | **Device health gate** | Deny battery opt / FSI → go online | Heartbeat reports unhealthy; driver skipped for dispatch until fixed |

## ADB helpers

```bash
# Simulate Doze (rooted / test builds)
adb shell dumpsys deviceidle force-idle

# Airplane
adb shell cmd connectivity airplane-mode enable
adb shell cmd connectivity airplane-mode disable

# Force-stop app (FGS may restart if sticky + was_online)
adb shell am force-stop com.nexryde.app
```

## Automated chaos (CI / release gate)

```bash
cd backend
# CI-scale (fast)
pytest tests/chaos/ -q

# Pre-release full scale
CHAOS_OFFER_N=10000 CHAOS_ONLINE_N=5000 pytest tests/chaos/test_release_gate.py -q
```

Release only passes if:

- No ride offers lost (terminal outcome always set)
- No duplicate accepts
- Trips recover automatically
- All services reconnect successfully

## Cancel UI coverage (code)

All live cancel entry points use `reliableCancel`:

- `driver-home` confirmDriverCancel
- `ActiveTripBar` handleCancelPending
- `RiderActiveTripHomePanel` confirmCancel
- `useRiderTrackingSession` (LiveTracking / finding cancel)
