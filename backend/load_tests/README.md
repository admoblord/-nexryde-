# NEXRYDE Load Tests

## Quick start

```bash
pip install locust
locust -f locustfile.py --host https://nexryde-backend-993913300770.us-central1.run.app
# Open http://localhost:8089
```

## Headless CI run

```bash
locust -f locustfile.py \
  --host https://nexryde-backend-993913300770.us-central1.run.app \
  --users 100 --spawn-rate 10 --run-time 5m --headless \
  --html load_report.html
```

## Thresholds (auto-enforced)

| Metric | Limit |
|---|---|
| p95 response time | ≤ 2,000 ms |
| Error rate | ≤ 1% |

## Traffic shape

| User class | Weight | Behaviour |
|---|---|---|
| `RiderUser` | 60% | Browse, profile, wallet |
| `DriverUser` | 30% | GPS pings every 2–4s |
| `MonitorUser` | 10% | Health poll only |
