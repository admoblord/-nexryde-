# Live trip e2e (staging / test accounts)

Production must not be used for request→accept→tracking→complete loops unless
accounts are explicitly flagged and `E2E_ALLOW_PROD=1` is set.

## Staging backend

Config: `backend/cloudrun.staging.yaml` (`nexryde-backend-staging`, `NEXRYDE_ENV=staging`,
`MONGODB_URI_STAGING`).

Deploy when ready:

```bash
gcloud run services replace backend/cloudrun.staging.yaml --region us-central1 --project=nexryde-app
```

## Seed test accounts (staging Mongo only)

```bash
export MONGODB_URI="$MONGODB_URI_STAGING"   # never prod
cd backend
python scripts/seed_e2e_test_accounts.py          # dry-run
python scripts/seed_e2e_test_accounts.py --apply  # writes is_test_account users
```

Accounts get `is_test_account=true`, `non_production=true`, approved driver profile,
monthly verification placeholders, and a trial subscription.

## Run the flow

```bash
export BASE_URL="https://<staging-host>"
export JWT_SECRET="$JWT_SECRET_STAGING"
export E2E_RIDER_ID="..."   # printed by seed script
export E2E_DRIVER_ID="..."
python scripts/e2e_live_trip_flow.py
```

The script aborts unless both users have `is_test_account=true`.
