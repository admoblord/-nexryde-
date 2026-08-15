"""ensure_indexes must keep going after a unique-index failure."""
from __future__ import annotations

import pytest

from db_indexes import _safe_create_index


class _FakeColl:
    def __init__(self, name: str, fail_unique: bool = False) -> None:
        self.name = name
        self.fail_unique = fail_unique
        self.calls: list[tuple[object, dict]] = []

    async def create_index(self, keys, **kwargs):
        self.calls.append((keys, kwargs))
        if kwargs.get("unique") and self.fail_unique:
            raise Exception("E11000 duplicate key")
        return f"{self.name}_ok"


@pytest.mark.asyncio
async def test_safe_create_index_ok():
    coll = _FakeColl("ok")
    assert await _safe_create_index(coll, "user_id") == "ok"
    assert coll.calls == [("user_id", {})]


@pytest.mark.asyncio
async def test_safe_create_index_unique_falls_back():
    coll = _FakeColl("engagement_notification_log", fail_unique=True)
    result = await _safe_create_index(
        coll,
        [("user_id", 1), ("day", 1), ("slot_id", 1)],
        unique=True,
        name="engagement_user_day_slot_unique",
    )
    assert result == "fallback"
    assert len(coll.calls) == 2
    assert coll.calls[0][1]["unique"] is True
    assert "unique" not in coll.calls[1][1]
    assert coll.calls[1][1]["name"] == "engagement_user_day_slot_lookup"


@pytest.mark.asyncio
async def test_ensure_indexes_continues_after_unique_failure():
    from db_indexes import ensure_indexes

    created: list[str] = []

    class _Coll:
        def __init__(self, name: str) -> None:
            self.name = name

        async def create_index(self, keys, **kwargs):
            created.append(self.name)
            if self.name == "engagement_notification_log" and kwargs.get("unique"):
                raise Exception("E11000 duplicate key")
            return "ok"

        async def index_information(self):
            return {}

        async def estimated_document_count(self):
            return 0

        async def drop_index(self, *args, **kwargs):
            return None

        def aggregate(self, *args, **kwargs):
            async def _empty():
                if False:
                    yield None

            return _empty()

    class _DB:
        def __getattr__(self, name: str):
            return _Coll(name)

    await ensure_indexes(_DB())
    assert "engagement_notification_log" in created
    assert "route_cache" in created
    assert "trip_events" in created
    assert "fare_lock_estimates" in created
