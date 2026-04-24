"""
Perceptual similarity for face images (base64 / data-URL).

The legacy implementation compared SHA-256 digests of the base64 *string*, which is
meaningless for “same person, new photo”: any re-encode or pixel change yields an
unrelated score. Here we decode the image and use standard aHash + dHash Hamming
similarity, with an optional center crop so typical selfie framing still lines up.

This is not ML face embedding (no dlib/AWS Rekognition); it is robust *image*
similarity suitable for pairing with PIN/phone checks. For stronger guarantees,
plug in a real face API later and keep this as a fallback.
"""

from __future__ import annotations

import base64
import logging
from io import BytesIO
from typing import Optional

logger = logging.getLogger("server")

# Calibrated 0..100 scores from perceptual hashes (aHash + dHash). These are *not* ML face embeddings;
# use higher thresholds for money/SIM paths, lower reject floor for fortress (PIN+phone already passed).
FACE_MATCH_STRONG_MIN = 72.0
FACE_MATCH_FORTRESS_REJECT_BELOW = 32.0
FACE_MATCH_SENSITIVE_MIN = 58.0
# Face-unlock flows (Fortress, SIM reconfirm): use `face_template_match_confidence` + these.
FACE_TEMPLATE_FORTRESS_REJECT_BELOW = 28.0
# Above ~52 for unrelated test textures; same-face captures usually clear 55+; retry if borderline.
FACE_TEMPLATE_SIMSWAP_MIN = 55.0

_MIN_B64_LEN = 80
_MIN_SIDE = 48


def _strip_data_url(value: Optional[str]) -> str:
    if not value:
        return ""
    return value.split(",", 1)[1] if "," in value else value


def _decode_image_bytes(value: Optional[str]) -> bytes:
    raw = _strip_data_url(value)
    if len(raw) < _MIN_B64_LEN:
        return b""
    try:
        return base64.b64decode(raw, validate=True)
    except Exception:
        try:
            return base64.b64decode(raw)
        except Exception:
            return b""


def _center_crop_square(img: "Image.Image", frac: float = 0.72) -> "Image.Image":
    w, h = img.size
    side = max(_MIN_SIDE, int(min(w, h) * frac))
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def _ahash_64(img: "Image.Image") -> int:
    from PIL import Image

    g = img.convert("L").resize((8, 8), Image.Resampling.LANCZOS)
    px = list(g.getdata())
    m = sum(px) / 64.0
    bits = 0
    for i, p in enumerate(px):
        if p > m:
            bits |= 1 << i
    return bits


def _dhash_64(img: "Image.Image") -> int:
    from PIL import Image

    g = img.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    bits = 0
    k = 0
    for y in range(8):
        for x in range(8):
            a = g.getpixel((x, y))
            b = g.getpixel((x + 1, y))
            if a < b:
                bits |= 1 << k
            k += 1
    return bits


def _hamming64_similarity(ha: int, hb: int) -> float:
    v = (ha ^ hb) & ((1 << 64) - 1)
    if hasattr(v, "bit_count"):
        dist = v.bit_count()
    else:  # Python < 3.10
        dist = bin(v).count("1")
    return 100.0 * (1.0 - min(64, dist) / 64.0)


def _pair_score(im1: "Image.Image", im2: "Image.Image") -> float:
    a1, a2 = _ahash_64(im1), _ahash_64(im2)
    d1, d2 = _dhash_64(im1), _dhash_64(im2)
    sa = _hamming64_similarity(a1, a2)
    sd = _hamming64_similarity(d1, d2)
    return 0.42 * sa + 0.58 * sd


def _best_similarity(im1: "Image.Image", im2: "Image.Image") -> float:
    s_full = _pair_score(im1, im2)
    try:
        c1 = _center_crop_square(im1)
        c2 = _center_crop_square(im2)
        s_crop = _pair_score(c1, c2)
    except Exception:
        s_crop = s_full
    return max(s_full, s_crop)


def _texture_energy_l_48(im: "Image.Image") -> float:
    """Low value ≈ solid color or blank wall; real selfies usually have plenty of local contrast."""
    from PIL import Image

    g = im.convert("L").resize((48, 48), Image.Resampling.LANCZOS)
    p = list(g.getdata())
    mu = sum(p) / len(p)
    return sum((float(x) - mu) ** 2 for x in p) / len(p)


def _mae_similarity_64(im1: "Image.Image", im2: "Image.Image") -> float:
    """How alike overall brightness/structure is on a fixed grid (0–100). Same person, new capture → high."""
    from PIL import Image

    a = im1.convert("L").resize((64, 64), Image.Resampling.LANCZOS)
    b = im2.convert("L").resize((64, 64), Image.Resampling.LANCZOS)
    n = 64 * 64
    mae = sum(abs(int(p) - int(q)) for p, q in zip(a.getdata(), b.getdata())) / float(n)
    return 100.0 * (1.0 - min(255.0, mae) / 255.0)


def _decode_pair_rgb(reference_image: Optional[str], observed_image: Optional[str]) -> Optional[tuple["Image.Image", "Image.Image"]]:
    from PIL import Image

    ref_b = _decode_image_bytes(reference_image)
    obs_b = _decode_image_bytes(observed_image)
    if len(ref_b) < 32 or len(obs_b) < 32:
        return None
    try:
        im1 = Image.open(BytesIO(ref_b)).convert("RGB")
        im2 = Image.open(BytesIO(obs_b)).convert("RGB")
    except Exception as exc:
        logger.warning("face_match: could not decode image: %s", exc)
        return None
    if min(im1.size) < _MIN_SIDE or min(im2.size) < _MIN_SIDE:
        return None
    return im1, im2


def face_template_match_confidence(reference_image: Optional[str], observed_image: Optional[str]) -> float:
    """
    Face-unlock style score: blend structural hash (pose/framing) with MAE (global look).
    Use for Fortress + SIM reconfirm; pair with FACE_TEMPLATE_* thresholds.
    """
    pair = _decode_pair_rgb(reference_image, observed_image)
    if not pair:
        return 0.0
    im1, im2 = pair
    try:
        h = _best_similarity(im1, im2)
        m = _mae_similarity_64(im1, im2)
        # Emphasize structural hash; global MAE modulates. Same person → both h and m rise together.
        # h * (0.4 + 0.6 * m/100) keeps pathological "two noise textures" pairs low while
        # re-encodes of the same photo stay at 100.
        score = h * (0.4 + 0.6 * (m / 100.0))
        t1, t2 = _texture_energy_l_48(im1), _texture_energy_l_48(im2)
        if t1 < 90.0 and t2 < 90.0 and score < 92.0:
            # e.g. two *different* flat color blocks: hashes can align by accident; re-encodes of the
            # same file stay near 100 and must not be capped.
            score = min(score, 48.0)
        return round(max(0.0, min(100.0, score)), 2)
    except Exception as exc:
        logger.warning("face_template_match: similarity error: %s", exc)
        return 0.0


def face_match_confidence(reference_image: Optional[str], observed_image: Optional[str]) -> float:
    """
    Return 0..100 similarity. Higher means the two images are more visually alike
    (perceptual hash), e.g. same person / same photo re-encoded, not cryptographic
    equality of bytes.
    """
    pair = _decode_pair_rgb(reference_image, observed_image)
    if not pair:
        return 0.0
    im1, im2 = pair
    try:
        score = _best_similarity(im1, im2)
        return round(max(0.0, min(100.0, score)), 2)
    except Exception as exc:
        logger.warning("face_match: similarity error: %s", exc)
        return 0.0
