"""Contract tests for JWT access-token revocation wiring."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_auth_middleware_checks_revoked_access_token_jti():
    source = (ROOT / "server.py").read_text()
    assert "request.state.jwt_payload = payload" in source
    assert 'store.exists(f"auth:revoked_jti:{jti}")' in source
    assert '"Token revoked"' in source


def test_logout_blacklists_current_access_token_jti():
    source = (ROOT / "routers" / "auth.py").read_text()
    assert 'store.set(f"auth:revoked_jti:{jti}", "1", ttl=ttl)' in source
    assert '"revoked_at": datetime.now(timezone.utc).isoformat()' in source
