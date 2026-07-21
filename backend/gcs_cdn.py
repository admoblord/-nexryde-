"""
Google Cloud Storage CDN helper for NEXRYDE profile/document images.

Provides:
  upload_image_to_gcs(bucket, object_name, data_bytes, content_type) → public URL
  delete_from_gcs(bucket, object_name) → bool
  get_signed_url(bucket, object_name, expiry_minutes) → signed URL

All images are uploaded at maximum 1024px and WebP format for bandwidth savings.
The bucket should have Uniform Access Control + CDN (Cloud CDN or Firebase Hosting
CDN) attached for edge caching.

If GCS is unavailable (missing credentials / bucket), operations fall back to
returning None so callers continue to use the existing base64 MongoDB path.
"""
from __future__ import annotations

import io
import logging
import os
from typing import Optional

logger = logging.getLogger("gcs_cdn")

GCS_BUCKET = os.environ.get("GCS_MEDIA_BUCKET", "")  # e.g. nexryde-media


def _client():
    """Lazy-initialise GCS client; returns None if SDK/creds not available."""
    try:
        from google.cloud import storage  # type: ignore
        return storage.Client()
    except Exception as exc:
        logger.debug("GCS client unavailable: %s", exc)
        return None


def _compress_to_webp(data: bytes, max_size: int = 1024) -> bytes:
    """Resize & convert image to WebP at quality=82. Falls back to original if Pillow absent."""
    try:
        from PIL import Image  # type: ignore
        img = Image.open(io.BytesIO(data))
        img = img.convert("RGB")
        w, h = img.size
        if max(w, h) > max_size:
            ratio = max_size / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=82, method=4)
        return buf.getvalue()
    except Exception:
        return data


async def upload_image_to_gcs(
    object_name: str,
    data_bytes: bytes,
    content_type: str = "image/webp",
    *,
    compress: bool = True,
    bucket: str = "",
) -> Optional[str]:
    """
    Upload image bytes to GCS and return a public CDN URL.

    Returns:
        Public URL string, or None if GCS is unavailable.
    """
    bucket_name = bucket or GCS_BUCKET
    if not bucket_name:
        return None

    client = _client()
    if client is None:
        return None

    if compress and content_type.startswith("image/"):
        data_bytes = _compress_to_webp(data_bytes)
        # Strip original extension, use .webp
        if not object_name.endswith(".webp"):
            object_name = object_name.rsplit(".", 1)[0] + ".webp"
        content_type = "image/webp"

    try:
        bucket_obj = client.bucket(bucket_name)
        blob = bucket_obj.blob(object_name)
        blob.upload_from_string(data_bytes, content_type=content_type)
        # Make publicly readable (bucket must have allUsers:objectViewer IAM)
        blob.make_public()
        public_url = blob.public_url
        logger.info("gcs_upload ok object=%s size=%d url=%s", object_name, len(data_bytes), public_url)
        return public_url
    except Exception as exc:
        logger.error("gcs_upload failed object=%s err=%s", object_name, exc)
        return None


async def delete_from_gcs(object_name: str, bucket: str = "") -> bool:
    bucket_name = bucket or GCS_BUCKET
    if not bucket_name:
        return False
    client = _client()
    if client is None:
        return False
    try:
        bucket_obj = client.bucket(bucket_name)
        blob = bucket_obj.blob(object_name)
        blob.delete()
        return True
    except Exception:
        return False


async def upload_bytes_private(
    object_name: str,
    data_bytes: bytes,
    content_type: str,
    *,
    bucket: str = "",
) -> Optional[str]:
    """Upload raw bytes to a PRIVATE GCS object (no public ACL, no compression).

    Used for sensitive PII (driver licenses, NIN, insurance) where the original
    bytes must be preserved exactly and the object must never be world-readable.

    Returns the object key (object_name) on success, or None if GCS is unavailable.
    The caller stores only this key in Mongo; bytes are streamed back through an
    authenticated endpoint via download_bytes().
    """
    bucket_name = bucket or GCS_BUCKET
    if not bucket_name:
        return None
    client = _client()
    if client is None:
        return None
    try:
        blob = client.bucket(bucket_name).blob(object_name)
        blob.upload_from_string(data_bytes, content_type=content_type)
        # Intentionally NOT make_public — bucket enforces public-access-prevention.
        logger.info("gcs_private_upload ok object=%s size=%d", object_name, len(data_bytes))
        return object_name
    except Exception as exc:
        logger.error("gcs_private_upload failed object=%s err=%s", object_name, exc)
        return None


async def download_bytes(object_name: str, *, bucket: str = "") -> Optional[bytes]:
    """Download raw bytes for a private object by key. Returns None if unavailable."""
    bucket_name = bucket or GCS_BUCKET
    if not bucket_name or not object_name:
        return None
    client = _client()
    if client is None:
        return None
    try:
        blob = client.bucket(bucket_name).blob(object_name)
        return blob.download_as_bytes()
    except Exception as exc:
        logger.error("gcs_download failed object=%s err=%s", object_name, exc)
        return None


def gcs_object_exists(object_name: str, *, bucket: str = "") -> bool:
    """Return True if the object exists in the bucket (verification before unset)."""
    bucket_name = bucket or GCS_BUCKET
    if not bucket_name or not object_name:
        return False
    client = _client()
    if client is None:
        return False
    try:
        return client.bucket(bucket_name).blob(object_name).exists()
    except Exception:
        return False


def get_signed_url(
    object_name: str,
    expiry_minutes: int = 60,
    bucket: str = "",
) -> Optional[str]:
    """Generate a signed URL valid for `expiry_minutes`."""
    import datetime
    bucket_name = bucket or GCS_BUCKET
    if not bucket_name:
        return None
    client = _client()
    if client is None:
        return None
    try:
        blob = client.bucket(bucket_name).blob(object_name)
        url = blob.generate_signed_url(
            expiration=datetime.timedelta(minutes=expiry_minutes),
            method="GET",
        )
        return url
    except Exception as exc:
        logger.warning("signed_url failed: %s", exc)
        return None
