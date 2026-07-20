"""Production Redis dependency contract tests."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_shared_redis_store_requires_redis_in_explicit_production():
    source = (ROOT / "redis_store.py").read_text()
    assert 'os.environ.get("ENVIRONMENT", "development")' in source
    assert "REDIS_REQUIRED" in source
    assert "REDIS_URL is required in production" in source
    # Mid-op failures must not silently diverge to per-instance memory in production.
    assert "_on_op_error" in source
    assert "Redis {op} failed in production" in source or "failed in production" in source


def test_realtime_dispatch_requires_redis_in_explicit_production():
    source = (ROOT / "routers" / "realtime_dispatch.py").read_text()
    assert 'os.environ.get("ENVIRONMENT", "development")' in source
    assert "REDIS_REQUIRED" in source
    assert "realtime cross-instance dispatch" in source


def test_auth_middleware_fails_closed_on_revocation_check_errors():
    source = (ROOT / "server.py").read_text()
    assert "Session validation temporarily unavailable" in source
    assert "auth_revocation_check_failed" in source
