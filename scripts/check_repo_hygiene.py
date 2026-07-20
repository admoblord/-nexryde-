#!/usr/bin/env python3
"""Fail CI when sensitive local artifacts are present in commit-visible files."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

BLOCKED_PATH_PATTERNS = [
    re.compile(r"(^|/)backend/backups/"),
    re.compile(r"(^|/)\.cursor/debug-[^/]+\.log$"),
    re.compile(r"(^|/)\.env(\.|$)"),
    re.compile(r"(^|/)(credentials|service-account|firebase-admin).*\.json$", re.IGNORECASE),
    re.compile(r"(^|/).*\.(bson|rdb|pem|p12|pfx|key)$", re.IGNORECASE),
]

ALLOWED_PATHS = {
    ".env.example",
    "backend/.env.example",
    "frontend/.env.example",
    # Client Firebase configs (package/SHA restricted). Required for Android FCM builds.
    "frontend/google-services.json",
    "frontend/android/app/google-services.json",
}

BLOCKED_CONTENT_PATTERNS = [
    re.compile(
        r"-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----[A-Za-z0-9+/=\s]{80,}-----END",
        re.DOTALL,
    ),
    re.compile(
        r"mongodb(\+srv)?://(?!(USER|username|user|db_user):(\*\*\*|PASS|PASSWORD|password|pass)@)[^:\s/]+:[^@\s]+@",
        re.IGNORECASE,
    ),
    re.compile(r"\b(sk|pk)_(live|test)_[0-9a-zA-Z]{16,}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
]

TEXT_SUFFIX_ALLOWLIST = {
    ".bash",
    ".css",
    ".env",
    ".example",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".kt",
    ".md",
    ".mjs",
    ".py",
    ".sh",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}


def _commit_visible_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-co", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return [ROOT / line for line in result.stdout.splitlines() if line.strip()]


def _is_text_candidate(path: Path) -> bool:
    if path.suffix.lower() in TEXT_SUFFIX_ALLOWLIST:
        return True
    return path.name in {".gitignore", "Dockerfile"}


def main() -> int:
    findings: list[str] = []

    for path in _commit_visible_files():
        rel = path.relative_to(ROOT).as_posix()
        if rel in ALLOWED_PATHS:
            continue

        for pattern in BLOCKED_PATH_PATTERNS:
            if pattern.search(rel):
                findings.append(f"blocked path: {rel}")
                break

        if not _is_text_candidate(path) or not path.is_file():
            continue

        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        for pattern in BLOCKED_CONTENT_PATTERNS:
            if pattern.search(content):
                findings.append(f"blocked secret-like content: {rel}")
                break

    if findings:
        print("Repository hygiene check failed:")
        for item in findings:
            print(f"  - {item}")
        return 1

    print("Repository hygiene check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
