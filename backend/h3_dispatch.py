"""Uber-style H3 hexagonal indexing for nearby-driver matching.

Resolution 8 (~0.74 km²) — industry default for finding drivers.
Match expands grid_disk(k=2 → 19 cells), then k=4 if sparse.
Falls back cleanly when the `h3` package is unavailable.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

H3_RES = 8
H3_KEY_PREFIX = f"h3:{H3_RES}:"

try:
    import h3  # type: ignore[import]

    _H3_OK = True
except Exception:  # pragma: no cover
    h3 = None  # type: ignore
    _H3_OK = False
    logger.warning("h3 package unavailable — H3 dispatch disabled (GEO fallback)")


def h3_available() -> bool:
    return bool(_H3_OK)


def cell_for(lat: float, lng: float, res: int = H3_RES) -> Optional[str]:
    if not _H3_OK or h3 is None:
        return None
    try:
        return str(h3.latlng_to_cell(float(lat), float(lng), int(res)))
    except Exception:
        return None


def cell_disk(lat: float, lng: float, k: int, res: int = H3_RES) -> list[str]:
    if not _H3_OK or h3 is None:
        return []
    try:
        center = h3.latlng_to_cell(float(lat), float(lng), int(res))
        return [str(c) for c in h3.grid_disk(center, int(k))]
    except Exception:
        logger.exception("h3 grid_disk failed")
        return []


def cell_set_key(cell: str) -> str:
    return f"{H3_KEY_PREFIX}{cell}:drivers"


async def index_driver_cell(
    store: Any,
    driver_id: str,
    *,
    lat: float,
    lng: float,
    previous_cell: Optional[str] = None,
) -> Optional[str]:
    """Move driver into the H3 cell for lat/lng. Returns new cell id."""
    if not driver_id:
        return previous_cell
    new_cell = cell_for(lat, lng)
    if not new_cell:
        return previous_cell
    if previous_cell and previous_cell != new_cell:
        try:
            await store.srem(cell_set_key(previous_cell), driver_id)
        except Exception:
            logger.debug("h3 srem old cell failed", exc_info=True)
    try:
        await store.sadd(cell_set_key(new_cell), driver_id)
    except Exception:
        logger.debug("h3 sadd failed", exc_info=True)
        return previous_cell
    return new_cell


async def remove_driver_cell(
    store: Any,
    driver_id: str,
    cell: Optional[str],
) -> None:
    if not driver_id or not cell:
        return
    try:
        await store.srem(cell_set_key(cell), driver_id)
    except Exception:
        logger.debug("h3 remove failed", exc_info=True)


async def nearby_h3_driver_ids(
    store: Any,
    *,
    lat: float,
    lng: float,
    k: int = 2,
    count: int = 30,
) -> list[str]:
    """Uber DISCO-style: union drivers in rider cell + k-ring neighbors."""
    cells = cell_disk(lat, lng, k)
    if not cells:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for cell in cells:
        try:
            members = await store.smembers(cell_set_key(cell))
        except Exception:
            members = []
        for mid in members or []:
            did = str(mid or "").strip()
            if not did or did in seen:
                continue
            seen.add(did)
            out.append(did)
            if len(out) >= count:
                return out
    return out
