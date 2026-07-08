#!/usr/bin/env python3
"""Verify admin_ops router imports and key handlers exist (no DB required)."""
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

def main():
    mod = importlib.import_module("routers.admin_ops")
    routes = [getattr(r, "path", None) for r in mod.admin_ops_router.routes]
    required = [
        "/admin/ops-center",
        "/admin/analytics",
        "/admin/surge-config",
        "/admin/release-config",
        "/admin/system-audit",
        "/admin/withdrawals/{tx_id}/approve",
    ]
    missing = [p for p in required if p not in routes]
    if missing:
        print("FAIL missing routes:", missing)
        return 1
    print(f"OK admin_ops: {len(routes)} routes registered")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
