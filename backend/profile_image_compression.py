"""Compress and validate rider/driver profile portrait uploads."""
from __future__ import annotations

import base64
import re
from io import BytesIO
from typing import Tuple

from fastapi import HTTPException
from PIL import Image, ImageOps

# Keep in sync with frontend fileCompressionService.ts PROFILE_IMAGE_MAX_BYTES
PROFILE_IMAGE_MAX_BYTES = 300 * 1024  # 300KB
PROFILE_IMAGE_MIN_BYTES = 2 * 1024  # 2KB

_DATA_URI_RE = re.compile(r"^data:(image/[\w+.-]+);base64,(.+)$", re.DOTALL | re.IGNORECASE)


def decode_image_payload(raw: str) -> bytes:
    """Accept data-URI or raw base64 from mobile clients."""
    text = (raw or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Image data is required")
    match = _DATA_URI_RE.match(text)
    if match:
        try:
            return base64.b64decode(match.group(2), validate=True)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid base64 image data") from exc
    try:
        return base64.b64decode(text, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid image format") from exc


def compress_profile_image(content: bytes) -> Tuple[bytes, str]:
    """Square-friendly portrait: max 512px edge, JPEG ≤300KB."""
    try:
        img = Image.open(BytesIO(content))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid or unreadable image: {exc}") from exc

    plans = (
        (512, 72),
        (512, 60),
        (384, 60),
        (384, 50),
        (320, 45),
        (256, 40),
    )
    smallest: bytes | None = None

    for max_side, quality in plans:
        copy = img.copy()
        copy.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        buf = BytesIO()
        copy.save(buf, format="JPEG", quality=quality, optimize=True)
        data = buf.getvalue()
        if len(data) <= PROFILE_IMAGE_MAX_BYTES:
            return data, "image/jpeg"
        if smallest is None or len(data) < len(smallest):
            smallest = data

    kb = (len(smallest or content)) // 1024
    raise HTTPException(
        status_code=400,
        detail=(
            f"Profile photo is still too large after compression ({kb}KB). "
            f"Maximum is {PROFILE_IMAGE_MAX_BYTES // 1024}KB."
        ),
    )


def normalize_profile_image_upload(raw: str) -> str:
    """Decode, compress, return data:image/jpeg;base64,... URI for MongoDB storage."""
    content = decode_image_payload(raw)
    if len(content) < PROFILE_IMAGE_MIN_BYTES:
        raise HTTPException(status_code=400, detail="Profile photo is too small or unreadable")
    jpeg, _ = compress_profile_image(content)
    if len(jpeg) > PROFILE_IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Profile photo exceeds {PROFILE_IMAGE_MAX_BYTES // 1024}KB limit",
        )
    encoded = base64.b64encode(jpeg).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"
