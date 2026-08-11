#!/usr/bin/env python3
"""
NEXRYDE — Run All E2E Tests
============================
Runs every E2E scenario in sequence and summarises results.

Usage:
    # Local dev server (must be running on :8080):
    python3 backend/tests/run_all_e2e.py

    # Against staging / production:
    BASE_URL=https://nexryde-backend-xxx.run.app \
    ADMIN_EMAIL=admin@admoblordgroup.com \
    ADMIN_PASSWORD=yourpassword \
    python3 backend/tests/run_all_e2e.py
"""

import asyncio
import importlib.util
import os
import sys
import time
import traceback
from pathlib import Path

HERE = Path(__file__).parent

TESTS = [
    ("Full Ride Flow",             HERE / "e2e_full_ride_flow.py"),
    ("Token Expiry + Refresh",     HERE / "e2e_token_expiry_refresh.py"),
    ("Background GPS + Offline",   HERE / "e2e_background_gps_driver_offline.py"),
]

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
RESET  = "\033[0m"
BOLD   = "\033[1m"


async def run_module(label: str, path: Path) -> tuple[bool, float, str]:
    """Import and run the `run()` coroutine from a test module."""
    start = time.monotonic()
    # Redirect stdout so we can capture the test's prints
    spec = importlib.util.spec_from_file_location("_e2e_mod", path)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    try:
        if asyncio.iscoroutinefunction(getattr(mod, "run", None)):
            await mod.run()
        elapsed = time.monotonic() - start
        return True, elapsed, ""
    except SystemExit as e:
        elapsed = time.monotonic() - start
        return False, elapsed, f"SystemExit({e.code})"
    except Exception:
        elapsed = time.monotonic() - start
        return False, elapsed, traceback.format_exc()


async def main():
    print(f"\n{BOLD}{'=' * 70}{RESET}")
    print(f"{BOLD}  NEXRYDE — Complete E2E Test Suite{RESET}")
    print(f"  BASE_URL : {os.environ.get('BASE_URL', 'http://localhost:8080')}")
    print(f"{BOLD}{'=' * 70}{RESET}\n")

    results: list[tuple[str, bool, float, str]] = []
    for label, path in TESTS:
        print(f"{BOLD}{'─' * 70}{RESET}")
        print(f"{BOLD}  Running: {label}{RESET}")
        print(f"{BOLD}{'─' * 70}{RESET}")
        passed, elapsed, err = await run_module(label, path)
        results.append((label, passed, elapsed, err))
        if not passed and err:
            print(f"\n{RED}  Error trace:{RESET}\n{err}")

    # ── Summary ──────────────────────────────────────────────────────────────
    print(f"\n{BOLD}{'=' * 70}{RESET}")
    print(f"{BOLD}  RESULTS SUMMARY{RESET}")
    print(f"{BOLD}{'=' * 70}{RESET}")
    all_passed = True
    for label, passed, elapsed, _ in results:
        icon  = f"{GREEN}PASS{RESET}" if passed else f"{RED}FAIL{RESET}"
        all_passed = all_passed and passed
        print(f"  [{icon}]  {label:<40}  {elapsed:.1f}s")

    print()
    if all_passed:
        print(f"{GREEN}{BOLD}  ALL TESTS PASSED — app is launch-ready ✓{RESET}")
    else:
        failed = sum(1 for _, p, *_ in results if not p)
        print(f"{RED}{BOLD}  {failed} test(s) FAILED — see output above{RESET}")
        sys.exit(1)
    print()


if __name__ == "__main__":
    asyncio.run(main())
