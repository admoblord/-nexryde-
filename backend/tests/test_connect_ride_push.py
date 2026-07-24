"""Connect-RPC RidePush health + AckOffer contract."""
from __future__ import annotations

import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("JWT_SECRET", "test-connect-ride-push")
os.environ.setdefault("ALLOW_INSECURE_JWT_FOR_TESTS", "1")
os.environ.setdefault("REDIS_REQUIRED", "false")


@pytest.fixture()
def client():
    from routers.connect_realtime import connect_realtime_router

    app = FastAPI()
    app.include_router(connect_realtime_router)
    return TestClient(app)


def test_connect_health(client):
    res = client.get("/api/connect/ride-push/health")
    assert res.status_code == 200
    body = res.json()
    assert body.get("ok") is True
    assert "RidePush" in body.get("proto", "")


def test_ack_offer_requires_auth(client):
    res = client.post(
        "/api/connect/nexryde.realtime.v1.RidePush/AckOffer",
        json={"driver_id": "d1", "offer_id": "o1"},
    )
    assert res.status_code == 401
