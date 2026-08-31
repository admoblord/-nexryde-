# Moving NexRyde off Cloud Run — status

**Done on `main`:** the app origin points at Emergent
(`https://nexryde-modular.preview.emergentagent.com`). Cloud Run service
manifests, CI deploy jobs, and Cloud Run-only ops scripts are removed from the
repo so merges cannot recreate billed services.

Google Maps stays — Maps Platform is unrelated to where the API is hosted.

---

## App

| Item | Status |
|---|---|
| `frontend/backend.config.json` | Emergent origin + stagingOrigin |
| `frontend/.env.example` | same |
| Security allowlist | derived from config (not `*.run.app`) |
| Cloud Run URLs in shipped app code | gone |

Change host later: edit `origin` in `backend.config.json` (or set
`EXPO_PUBLIC_BACKEND_URL` at build time) and rebuild.

---

## Backend / Mongo

| Item | Status |
|---|---|
| `backend/cloudrun*.yaml` | **deleted** |
| CI `deploy-production` / `deploy-staging` | **deleted** |
| Diagnose Places Egress workflow | **deleted** |
| Emergent `.env` template | `backend/.env.emergent.example` |
| Env checker | `backend/scripts/check_emergent_env.py` |
| Maintenance cron | `backend/scripts/emergent_maintenance_cron.sh` |
| Drop Cloud Run NAT from Atlas | `backend/scripts/atlas_drop_cloudrun_nat.sh` |
| Delete live GCP spend | `backend/scripts/cleanup_idle_cloud_spend.sh --apply --drop-cloudrun` |

Atlas previously allowlisted Cloud NAT `34.35.108.112` for Cloud Run. After
Emergent is healthy:

1. Add the Emergent egress IP to Atlas Network Access.
2. Confirm Mongo from Emergent (`/api/health/ready` or a login).
3. `./backend/scripts/atlas_drop_cloudrun_nat.sh --apply`
4. `./backend/scripts/cleanup_idle_cloud_spend.sh --apply --drop-cloudrun --drop-standby`

---

## Still on the Emergent host (ops, not git)

```bash
git pull origin main
cd backend
cp .env.emergent.example .env   # fill secrets; TRUSTED_HOSTS + NEXRYDE_PUBLIC_BACKEND_URL
python scripts/check_emergent_env.py
# start uvicorn / Emergent process
# install emergent_maintenance_cron.sh every 2 minutes
```

`REDIS_REQUIRED=false` (or Upstash). Use `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`
for FCM. Set Squad keys and `NEXRYDE_PUBLIC_BACKEND_URL` to the Emergent URL.
