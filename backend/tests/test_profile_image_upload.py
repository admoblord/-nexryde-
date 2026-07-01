"""Profile portrait upload — compression + data URI round-trip."""
from profile_image_compression import normalize_profile_image_upload, PROFILE_IMAGE_MAX_BYTES
from PIL import Image
from io import BytesIO
import base64


def _tiny_jpeg_b64(w: int = 256, h: int = 256) -> str:
    img = Image.new("RGB", (w, h), color=(40, 120, 200))
    # Add noise so JPEG is > 2KB minimum
    for x in range(0, w, 8):
        for y in range(0, h, 8):
            img.putpixel((x, y), (x % 255, y % 255, (x + y) % 255))
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_normalize_profile_image_upload_accepts_data_uri():
    raw = f"data:image/jpeg;base64,{_tiny_jpeg_b64()}"
    out = normalize_profile_image_upload(raw)
    assert out.startswith("data:image/jpeg;base64,")
    payload = base64.b64decode(out.split(",", 1)[1])
    assert 0 < len(payload) <= PROFILE_IMAGE_MAX_BYTES


def test_normalize_profile_image_upload_accepts_raw_base64():
    raw = _tiny_jpeg_b64(128, 128)
    out = normalize_profile_image_upload(raw)
    assert out.startswith("data:image/jpeg;base64,")
