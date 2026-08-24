# NEXRYDE core — operations quick reference

## One-click local checks

From repo root:

```bash
chmod +x scripts/verify_core.sh
./scripts/verify_core.sh
```

From `frontend/`: `npm run verify:core` (same script).

Optional (hits a running API): `NEXRYDE_BACKEND_URL=https://your-api.example.com ./scripts/verify_core.sh`

Auth path allowlists live in **`nexryde_api_paths.py`**; change them there and run `./scripts/verify_core.sh`.

## Health endpoints

| Path | Auth | Purpose |
|------|------|---------|
| `GET /api/health` | Public | Process alive |
| `GET /api/health/ready` | Public | MongoDB `ping` (503 if DB down) |
| `GET /api/health/ops` | Header `X-NEXRYDE-OPS-KEY` = `NEXRYDE_OPS_KEY` | DLQ counts; wrong key → 404 |
| `GET /api/health/maps` | Public | Maps reachability + the last Google BEFORE/AFTER call lines |
| `GET /api/ops/egress-ip` | Header `X-NEXRYDE-OPS-KEY` | Public source IP we egress from; `maps_key_ip_restrictable` says whether the Maps key can be locked to it |

## Environment variables

| Variable | Purpose |
|----------|---------|
| `NEXRYDE_OPS_KEY` | Protects `/api/health/ops` |
| `NEXRYDE_RESPONSE_TIME_HEADER=1` | Adds `X-Response-Time-ms` on responses |
| `SQUAD_DLQ_AUTOREPLAY` | `0` disables automatic Squad webhook DLQ replay loop |
| `NEXRYDE_PUBLIC_BACKEND_URL` / `SQUAD_*` | Squad checkout + callbacks (see `payments` router comments) |

## Squad webhook DLQ

- **Auto-retry**: background loop (see `server.py`); disable with `SQUAD_DLQ_AUTOREPLAY=0`.
- **Manual**: `GET/POST /api/payment/squad-webhook-dlq` (admin session token via `require_admin_request`).

## Mobile WebSocket URLs

Use `wss://` when `BACKEND_URL` is `https://` (see `getBackendWsBaseUrl` in the app). Token is passed as `?token=` on socket URLs, not as `Authorization` on the upgrade request.

## Auth middleware

Path lists are defined in `nexryde_api_paths.py` (tested by `tests/test_nexryde_api_paths.py`). Protected routes require a valid **Bearer JWT** except `/api/admin/*` (admin session checked in-route).
