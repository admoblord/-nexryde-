# Moving NexRyde off Cloud Run

Goal: the app and backend stop depending on Cloud Run. **Google Maps stays** —
Maps Platform is a separate product and is unaffected by where the API is hosted.

This file is the inventory. It is written from what is actually in the repo, not
from memory, so it can be worked through in order.

---

## 1. What the app itself needed (done)

The app named Cloud Run in six places, and one of them would have silently
broken every request after a host change:

| File | What it held | Now |
|---|---|---|
| `src/services/securityConfig.ts` | allowlist of `*.run.app` hosts — **rejected everything else** with `Security: Invalid API endpoint` | allowlist derived from the configured origin |
| `src/services/api.ts` | hardcoded production URL fallback | reads `resolveBackendOrigin()` |
| `app.config.js` | hardcoded production URL fallback | reads `backend.config.json` |
| `app.json` | `extra.BACKEND_URL` | removed (`app.config.js` owns it) |
| `eas.json` | per-profile prod + staging URLs, plus a dead `EXPO_PUBLIC_GRPC_RIDE_PUSH_URL` | profiles carry no host; the dead gRPC var is gone |
| `app/(auth)/driver-terms.tsx` | support link on a Cloud Run URL | follows the configured origin |

**To move the app to a new host, change one line** — `origin` in
`frontend/backend.config.json` — or set `EXPO_PUBLIC_BACKEND_URL` at build time.
`scripts/verify_backend_origin.cjs` fails the build if any other file starts
naming a provider again.

> The gRPC variable pointed at a second Cloud Run service
> (`nexryde-grpc-ridepush`) and **no code read it**. That service can be deleted.

---

## 2. What will take the backend down on a non-Cloud-Run host

These are hard blockers, not cleanup. Each one is a thing that works today only
because the process runs inside Google's network.

### 2.1 Redis is *required* in production

`backend/redis_store.py`:

```python
REDIS_REQUIRED = (... and os.environ.get("REDIS_REQUIRED", "true").lower() != "false")
```

`REDIS_URL` comes from Secret Manager `REDIS_URL_AFRICA` and points at
**Memorystore, which is reachable only from inside the VPC**. Off Cloud Run the
connection fails and, because `NEXRYDE_ENV=production`, the code raises instead
of degrading.

Pick one:
- set `REDIS_REQUIRED=false` and accept in-memory fallback (rate limits and
  realtime fanout stop being shared across processes), or
- point `REDIS_URL` at an internet-reachable Redis (Upstash, Redis Cloud). This
  is also a Memorystore bill you stop paying.

### 2.2 MongoDB Atlas allowlists the Cloud NAT address only

`backend/cloudrun.africa-south1.yaml` says it plainly:

```
run.googleapis.com/vpc-access-egress: "all-traffic"  # Atlas allowlisted to NAT 34.35.108.112 only
```

The new host has a different egress IP. **Add it to the Atlas access list before
cutover**, or the backend starts and every request fails on the database.

### 2.3 Credentials that arrive as mounted files

`GOOGLE_APPLICATION_CREDENTIALS=/secrets/firebase/firebase-service-account.json`
is a Cloud Run secret volume. Two things use it:

- **FCM push** (`notification_service.py`) — no file, no push notifications
- **GCS media** (`gcs_cdn.py`, bucket `nexryde-media`) — driver documents; falls
  back to base64 in MongoDB when unavailable

On Emergent use `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` (already supported — the
service writes the JSON to `/tmp`) or put the file on disk and point
`GOOGLE_APPLICATION_CREDENTIALS` at it.

### 2.4 Everything else in the environment is already portable

Verified: `MONGODB_URI` / `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `SQUAD_*`,
`TERMII_*`, `BREVO_API_KEY`, `GOOGLE_MAPS_API_KEY`, `CORS_ORIGINS`,
`TRUSTED_HOSTS`, `NEXRYDE_OPS_KEY` are all plain `os.environ` reads. They move to
a `.env` file unchanged.

`TRUSTED_HOSTS` **must** be updated to the new hostname or `TrustedHostMiddleware`
returns 400 for every request.

---

## 3. Cloud Run infrastructure that keeps billing until deleted

Cost drivers, roughly in order:

1. **`minScale: 1` with `cpu-throttling: false` and `cpu: 2`** — two vCPU and 1 GiB
   billed continuously, not per request. This is the single largest line.
2. **Serverless VPC connector `nexryde-vpc`** — billed per instance-hour while it
   exists, independent of traffic.
3. **Two extra Cloud Run services** — `nexryde-grpc-ridepush` (nothing reads its
   URL) and `nexryde-kafka-worker`.
4. **Memorystore Redis** — see 2.1.
5. **Artifact Registry + Cloud Build** — every push to main builds and stores an
   image (`gcloud builds submit`, `gcloud artifacts docker tags add`).
6. **Cloud Scheduler** `maintenance-tick` — points at the Cloud Run URL; must be
   repointed or replaced with a cron on the new host, or the guardians, saga
   retries, outbox drain and safe-arrival escalation stop running.

### Already stopped in CI (this PR)

- `deploy-production` / `deploy-staging` only run when
  `vars.DEPLOY_CLOUD_RUN=true` **or** the commit subject contains
  `[deploy-cloudrun]`. Default: **no more Cloud Build on every main merge**.
- EAS Android builds no longer `needs: deploy-production`, so a skipped Cloud
  Run deploy does not also skip the app build.
- Scheduled `Diagnose Places Egress` is opt-in the same way (manual dispatch
  still works).

Manifests to retire once cutover is done: `backend/cloudrun.africa-south1.yaml`,
`cloudrun.service.yaml`, `cloudrun.staging.yaml`, `cloudrun.grpc-ridepush.yaml`,
`cloudrun.kafka-worker*.yaml`.

---

## 4. What Emergent needs

From `EMERGENT_DEPLOYMENT_COMMANDS.md` and `DEPLOYMENT_GUIDE_EMERGENT.md`, it is a
git-pull host that runs the FastAPI app with a `.env`, not a container platform:

```bash
git pull origin main
cd backend && pip install -r requirements.txt
cp .env.emergent.example .env   # then fill secrets
python scripts/check_emergent_env.py
# uvicorn server:app --host 0.0.0.0 --port $PORT
```

`backend/Dockerfile` already respects `PORT`, so a container host works too.

Template: **`backend/.env.emergent.example`**. Checker:
**`backend/scripts/check_emergent_env.py`**. Maintenance tick replacement:
**`backend/scripts/emergent_maintenance_cron.sh`** (cron every 2 minutes).

Minimum `.env` for the new host:

```env
NEXRYDE_ENV=production
MONGODB_URI=<atlas uri>
DB_NAME=nexryde_db
JWT_SECRET=<...>
GOOGLE_MAPS_API_KEY=<...>
TRUSTED_HOSTS=<new-host>
CORS_ORIGINS=https://nexryde.app,exp://,nexryde://
REDIS_REQUIRED=false          # or REDIS_URL=<internet-reachable redis>
FIREBASE_SERVICE_ACCOUNT_JSON_BASE64=<base64 of service account json>
NEXRYDE_OPS_KEY=<...>
SQUAD_SECRET_KEY=<...>
SQUAD_PUBLIC_KEY=<...>
SQUAD_WEBHOOK_SECRET=<...>
SQUAD_BASE_URL=https://api-d.squadco.com
SQUAD_CHECKOUT_BASE_URL=https://pay.squadco.com
NEXRYDE_PUBLIC_BACKEND_URL=https://<new-host>
```

`NEXRYDE_PUBLIC_BACKEND_URL` matters: **Squad payment callbacks are built from
it**, so a stale value sends riders back to Cloud Run after paying.

> Historical hostname `https://nexryde-ui.emergent.host` returns
> **Application not found** (checked 2026-08-31). A new Emergent app URL is
> required before flipping `frontend/backend.config.json`.

---

## 5. Cutover order

1. Stand the backend up on Emergent with the `.env` above; run
   `python scripts/check_emergent_env.py`; add its egress IP to the Atlas
   allowlist (`GET /api/ops/egress-ip` with the ops key once the process is up).
2. Confirm `GET /api/health` and `GET /api/health/ready` on the new host —
   `ready` pings MongoDB, so it proves the allowlist.
3. Point Squad callbacks at the new host (`NEXRYDE_PUBLIC_BACKEND_URL`).
4. Install `emergent_maintenance_cron.sh` on a 2-minute cron.
5. Change `origin` in `frontend/backend.config.json`; build; verify sign-in,
   pickup/destination search and a trip request on a device.
6. Only then delete the Cloud Run services, the VPC connector and Memorystore
   (and leave `DEPLOY_CLOUD_RUN` unset so CI does not recreate them).

Steps 1–4 are reversible. Step 6 is not.

### Stop the Cloud Run bill *before* Emergent is ready (manual)

Until Emergent serves traffic, the cheapest reversible stop is:

```bash
# Scale the always-on instance away (biggest line item)
gcloud run services update nexryde-backend --region=africa-south1 --min=0 --cpu-throttling
gcloud run services update nexryde-grpc-ridepush --region=africa-south1 --min=0 --cpu-throttling || true
gcloud run services update nexryde-kafka-worker --region=africa-south1 --min=0 --cpu-throttling || true
```

Do **not** delete the VPC connector / Memorystore until the new host is healthy
and the app origin has been flipped — Atlas still depends on that NAT IP for
any leftover Cloud Run traffic.
