"""
Going online or offline must not leave a stale driver profile behind.

GET /drivers/{id}/profile is served from a 5-minute hot cache. Measured against
production: after a driver went offline the endpoint still reported them online,
and only corrected itself when the TTL lapsed. A driver tapping Go Online can be
told they are still offline for minutes.
"""
import ast
import inspect
from pathlib import Path

import routers.drivers as drivers_module

SRC = Path(drivers_module.__file__).read_text()


def _function_source(name: str) -> str:
    tree = ast.parse(SRC)
    for node in ast.walk(tree):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return ast.get_source_segment(SRC, node) or ""
    raise AssertionError(f"{name} not found in routers/drivers.py")


def test_helper_exists_and_is_best_effort():
    src = _function_source("_invalidate_driver_profile_cache")
    assert "invalidate_driver_hot_cache" in src
    # A cache that will not clear must never fail the toggle.
    assert "except Exception" in src


def test_every_online_write_invalidates_the_cache():
    """
    Each Mongo write of is_online inside the toggle must be followed by an
    invalidation, otherwise the profile endpoint keeps serving the old state.
    """
    src = _function_source("toggle_driver_online")
    writes = src.count("db.driver_profiles.update_one")
    invalidations = src.count("_invalidate_driver_profile_cache")
    assert writes >= 4, f"expected the four is_online write paths, found {writes}"
    assert invalidations == writes, (
        f"{writes} profile writes but {invalidations} cache invalidations — "
        "a path can still serve a stale is_online"
    )


def test_both_idempotent_shortcuts_invalidate():
    """The already-online and already-offline early returns write too."""
    src = _function_source("toggle_driver_online")
    for marker in ('"already_online": True', '"already_offline": True'):
        idx = src.find(marker)
        assert idx != -1, f"{marker} path missing"
        window = src[max(0, idx - 400):idx]
        assert "_invalidate_driver_profile_cache" in window, (
            f"the {marker} early return writes the profile without invalidating the cache"
        )


def test_profile_endpoint_still_reads_through_the_hot_cache():
    """Guards the assumption above: the endpoint is cached, so writes must clear it."""
    src = inspect.getsource(drivers_module.get_driver_profile)
    assert "driver_profile_key" in src and "cache_get_json" in src
