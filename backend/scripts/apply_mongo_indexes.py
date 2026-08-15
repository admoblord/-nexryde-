#!/usr/bin/env python3
"""Apply ensure_indexes() using the process Mongo client.

Run on Cloud Run (VPC / Atlas allowlist) or any host that can reach Atlas:

    python3 backend/scripts/apply_mongo_indexes.py
"""
from __future__ import annotations

import asyncio
import os
import sys

# Allow `python3 backend/scripts/apply_mongo_indexes.py` from repo root.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


async def main() -> int:
    from database import db
    from db_indexes import ensure_indexes

    await ensure_indexes(db)
    print("ensure_indexes finished")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
