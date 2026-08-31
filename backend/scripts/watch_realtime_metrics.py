#!/usr/bin/env python3
"""Poll NexRyde reliability watch metrics.

Usage:
  export NEXRYDE_API_BASE=https://nexryde-modular.preview.emergentagent.com
  export NEXRYDE_TOKEN='Bearer eyJ…'   # driver or admin JWT
  python3 backend/scripts/watch_realtime_metrics.py
  python3 backend/scripts/watch_realtime_metrics.py --once
  python3 backend/scripts/watch_realtime_metrics.py --interval 10
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request


def _get(url: str, token: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={"Authorization": token, "Accept": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _print_board(health: dict, watch: dict) -> None:
    print("─" * 60)
    print(f"ts={time.strftime('%H:%M:%S')}  redis_ok={health.get('redis_ok')}  "
          f"redis_ms={health.get('redis_latency_ms')}  event_bus={health.get('event_bus')}")
    w = watch.get("watch") or {}
    lat = w.get("latency_ms") or {}
    ctr = w.get("counters") or {}
    keys = [
        "fare.estimate_io_ms",
        "places.autocomplete_ms",
        "push.deliver_ms",
        "trip.cancel_ms",
        "saga.complete_ms",
        "saga.cancel_ms",
        "presence.online_ms",
    ]
    for k in keys:
        row = lat.get(k)
        if row:
            print(f"  {k:28} p50={row.get('p50'):7.1f}  p95={row.get('p95'):7.1f}  n={row.get('count')}")
    for k in ("push.missed_offer", "push.delivered_acked", "push.delivered_unacked",
              "saga.complete_enqueued", "saga.cancel_enqueued"):
        if k in ctr:
            print(f"  {k:28} count={ctr[k]}")
    alerts = watch.get("alerts") or []
    if alerts:
        print("  ALERTS:")
        for a in alerts:
            print(f"    ! {a}")
    else:
        print("  alerts: none")
    print("─" * 60)


def main() -> int:
    p = argparse.ArgumentParser(description="Watch NexRyde realtime SLO metrics")
    p.add_argument("--base", default=os.environ.get("NEXRYDE_API_BASE", "").rstrip("/"))
    p.add_argument("--token", default=os.environ.get("NEXRYDE_TOKEN", ""))
    p.add_argument("--interval", type=float, default=15.0)
    p.add_argument("--once", action="store_true")
    args = p.parse_args()
    if not args.base:
        print("Set NEXRYDE_API_BASE or --base", file=sys.stderr)
        return 2
    token = args.token
    if token and not token.lower().startswith("bearer "):
        token = f"Bearer {token}"
    if not token:
        print("Set NEXRYDE_TOKEN or --token (Bearer JWT)", file=sys.stderr)
        return 2

    while True:
        try:
            health = _get(f"{args.base}/api/realtime/health", token)
            watch = _get(f"{args.base}/api/realtime/metrics/watch", token)
            _print_board(health, watch)
            if not watch.get("ok", True):
                # Non-zero on --once when alerts fire
                if args.once:
                    return 1
        except urllib.error.HTTPError as e:
            print(f"HTTP {e.code}: {e.read()[:200]!r}", file=sys.stderr)
            if args.once:
                return 1
        except Exception as e:
            print(f"error: {e}", file=sys.stderr)
            if args.once:
                return 1
        if args.once:
            return 0
        time.sleep(max(3.0, args.interval))


if __name__ == "__main__":
    raise SystemExit(main())
