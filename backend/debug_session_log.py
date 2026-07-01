"""Append NDJSON debug lines for Cursor debug session (no PII)."""
from __future__ import annotations

import json
import os
import time
from typing import Any

_DEFAULT_PATH = "/Users/admoblord/nexryde/.cursor/debug-274678.log"


def debug_session_log(
    location: str,
    message: str,
    data: dict[str, Any],
    hypothesis_id: str,
    run_id: str = "run1",
) -> None:
    entry = {
        "sessionId": "274678",
        "timestamp": int(time.time() * 1000),
        "location": location,
        "message": message,
        "data": data,
        "hypothesisId": hypothesis_id,
        "runId": run_id,
    }
    path = os.environ.get("NEXRYDE_DEBUG_LOG_PATH", _DEFAULT_PATH)
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, default=str) + "\n")
    except Exception:
        pass
