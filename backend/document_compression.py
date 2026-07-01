"""Aggressive compression + size limits for driver document uploads."""
from __future__ import annotations

from io import BytesIO
from typing import Tuple

from fastapi import HTTPException
from PIL import Image, ImageOps

# Keep in sync with frontend fileCompressionService.ts
IMAGE_MAX_BYTES = 500 * 1024  # 500KB
PDF_MAX_BYTES = 2 * 1024 * 1024  # 2MB
IMAGE_MIN_BYTES = 5 * 1024  # 5KB — reject blank/unreadable captures
ALLOWED_IMAGE_MIMES = frozenset({"image/jpeg", "image/png", "image/webp", "image/jpg"})


def compress_driver_document_image(content: bytes, content_type: str | None = None) -> Tuple[bytes, str]:
    """
    Decode, EXIF-correct, resize, and re-encode as JPEG ≤500KB.
    Returns (jpeg_bytes, "image/jpeg").
    """
    try:
        img = Image.open(BytesIO(content))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid or unreadable image: {exc}") from exc

    plans = (
        (1024, 60),
        (1024, 50),
        (800, 50),
        (800, 40),
        (640, 40),
        (640, 35),
    )
    smallest: bytes | None = None

    for max_side, quality in plans:
        copy = img.copy()
        copy.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        buf = BytesIO()
        copy.save(buf, format="JPEG", quality=quality, optimize=True)
        data = buf.getvalue()
        if len(data) <= IMAGE_MAX_BYTES:
            return data, "image/jpeg"
        if smallest is None or len(data) < len(smallest):
            smallest = data

    kb = (len(smallest or content)) // 1024
    raise HTTPException(
        status_code=400,
        detail=(
            f"Document image is still too large after compression ({kb}KB). "
            f"Maximum is {IMAGE_MAX_BYTES // 1024}KB. Retake with better lighting or closer framing."
        ),
    )


def validate_compressed_document(content: bytes, mime: str | None, *, label: str) -> None:
    """Final guard after compression."""
    if mime and mime not in ALLOWED_IMAGE_MIMES and not str(mime).startswith("image/"):
        raise HTTPException(status_code=400, detail=f"{label}: only JPG/PNG/WebP images are allowed")
    if len(content) < IMAGE_MIN_BYTES:
        raise HTTPException(status_code=400, detail=f"{label} is too small or unreadable")
    if len(content) > IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"{label} exceeds {IMAGE_MAX_BYTES // 1024}KB limit after compression",
        )
