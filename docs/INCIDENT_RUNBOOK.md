# Nexryde Incident Runbook

## Severity Levels

- `SEV-1`: money loss risk, SOS outage, trip matching outage, auth outage.
- `SEV-2`: partial degradation (slow trips, delayed notifications, delayed payouts).
- `SEV-3`: non-critical feature regression.

## First 10 Minutes (All Incidents)

- Confirm incident scope: rider, driver, region, endpoint family.
- Assign one incident commander and one communications owner.
- Freeze deploys until containment.
- Capture start time, impacted services, suspected change window.

## Payments / Wallet Incident

- Check `/api/health/ops` and webhook DLQ counters.
- Verify latest `wallet_payment_intents` and `transactions` write rates.
- Confirm no duplicate credit pattern:
  - same `payment_intent_id` on more than one successful transaction.
- Containment:
  - pause manual refunds/payouts unless approved by incident commander.
  - keep webhook intake enabled; replay only after root-cause identified.
- Recovery:
  - replay pending DLQ webhook events in small batches.
  - reconcile `wallet_payment_intents(status=completed)` vs successful `transactions`.

## SOS / Safety Incident

- Confirm `/api/sos/trigger` availability and latency.
- Validate `sos_alerts` writes and emergency fanout success logs.
- Containment:
  - if automated fanout is degraded, switch to manual escalation protocol.
- Recovery:
  - backfill failed fanout attempts from incident window.
  - produce affected trip/user list for operations follow-up.

## Realtime / Chat Incident

- Verify websocket connection counts and disconnect spikes.
- Check chat write success to `trip_messages`.
- Containment:
  - keep REST chat polling fallback enabled.
- Recovery:
  - ensure messages persisted during outage are retrievable in history endpoint.

## Rollback Decision Rules

- Roll back immediately if:
  - payout/wallet correctness is uncertain, or
  - auth bypass suspected, or
  - SOS path fails for valid requests.
- Use the last known-good revision and validate:
  - auth, trip request, wallet verify, SOS trigger, driver withdraw.

## Post-Incident (within 24h)

- Timeline with UTC timestamps.
- Root cause and trigger.
- Permanent fix and test coverage added.
- Action items with owners and due dates.
