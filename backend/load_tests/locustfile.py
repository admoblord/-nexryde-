"""
NexRyde Load Test — Locust

Simulates real traffic patterns across the critical rider + driver path.

Usage:
    pip install locust
    locust -f locustfile.py --host https://nexryde-backend-993913300770.us-central1.run.app

    # Headless (CI):
    locust -f locustfile.py \
        --host https://nexryde-backend-993913300770.us-central1.run.app \
        --users 50 --spawn-rate 5 --run-time 3m --headless \
        --html load_report.html
"""
from __future__ import annotations

import random
import string
import time

from locust import HttpUser, TaskSet, between, task, events


def _rand_email() -> str:
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"loadtest_{suffix}@nexryde-ci.test"


def _rand_phone() -> str:
    return "0" + "".join(random.choices("0123456789", k=10))


# ── Shared token pool ─────────────────────────────────────────────────────────

_rider_tokens: list[str] = []
_driver_tokens: list[str] = []


# ── Task sets ─────────────────────────────────────────────────────────────────

class PublicTasks(TaskSet):
    """Health + public endpoints — no auth needed."""

    @task(3)
    def health_liveness(self):
        self.client.get("/api/health", name="/api/health")

    @task(2)
    def health_ready(self):
        with self.client.get("/api/health/ready", name="/api/health/ready",
                             catch_response=True) as resp:
            if resp.status_code not in (200, 503):
                resp.failure(f"Unexpected status {resp.status_code}")

    @task(1)
    def places_autocomplete(self):
        self.client.get(
            "/api/places/autocomplete",
            params={"input": "Lagos", "sessiontoken": "load-test"},
            name="/api/places/autocomplete",
        )


class RiderAuthTasks(TaskSet):
    """Rider login + profile fetch."""

    token: str = ""

    def on_start(self):
        global _rider_tokens
        if _rider_tokens:
            self.token = random.choice(_rider_tokens)
            return
        # Register a fresh rider
        email = _rand_email()
        r = self.client.post(
            "/api/auth/email-signin",
            json={"email": email, "name": "Load Test Rider"},
            name="/api/auth/email-signin [register]",
        )
        if r.status_code == 200:
            data = r.json()
            self.token = data.get("access_token") or data.get("token", "")
            if self.token:
                _rider_tokens.append(self.token)

    @task(5)
    def get_profile(self):
        if not self.token:
            return
        self.client.get(
            "/api/profile",
            headers={"Authorization": f"Bearer {self.token}"},
            name="/api/profile",
        )

    @task(2)
    def get_wallet(self):
        if not self.token:
            return
        self.client.get(
            "/api/wallet",
            headers={"Authorization": f"Bearer {self.token}"},
            name="/api/wallet",
        )

    @task(1)
    def refresh_token(self):
        # Uses /auth/refresh-token — no refresh token in this context so expect 400
        self.client.post(
            "/api/auth/refresh-token",
            json={"refresh_token": "dummy-load-test-token"},
            name="/api/auth/refresh-token",
        )


class DriverLocationTasks(TaskSet):
    """Driver goes online + sends GPS pings."""

    token: str = ""
    user_id: str = ""

    def on_start(self):
        global _driver_tokens
        if _driver_tokens:
            self.token, self.user_id = random.choice(_driver_tokens)
            return

    @task(10)
    def ping_location(self):
        if not self.token or not self.user_id:
            return
        lat = 6.5244 + random.uniform(-0.05, 0.05)
        lng = 3.3792 + random.uniform(-0.05, 0.05)
        self.client.put(
            f"/api/drivers/{self.user_id}/location",
            json={
                "latitude": lat,
                "longitude": lng,
                "device_id": "load-test-device",
                "accuracy": 10.0,
            },
            headers={"Authorization": f"Bearer {self.token}"},
            name="/api/drivers/{id}/location",
        )

    @task(1)
    def check_nearby_drivers(self):
        """Simulates a rider querying nearby drivers before booking."""
        self.client.get(
            "/api/drivers/nearby",
            params={"lat": 6.5244, "lng": 3.3792, "radius": 5000},
            name="/api/drivers/nearby",
        )


# ── User classes ──────────────────────────────────────────────────────────────

class RiderUser(HttpUser):
    """Simulates an active rider browsing, fetching profile + wallet."""
    tasks = [PublicTasks, RiderAuthTasks]
    wait_time = between(1, 3)
    weight = 6


class DriverUser(HttpUser):
    """Simulates an online driver sending GPS pings."""
    tasks = [DriverLocationTasks]
    wait_time = between(2, 4)
    weight = 3


class MonitorUser(HttpUser):
    """Lightweight poller checking health (uptime monitor simulation)."""
    tasks = [PublicTasks]
    wait_time = between(5, 10)
    weight = 1


# ── Thresholds ────────────────────────────────────────────────────────────────

@events.quitting.add_listener
def assert_thresholds(environment, **kw):
    """Fail load test if p95 > 2s or error rate > 1%."""
    stats = environment.stats.total
    if stats.num_requests == 0:
        return
    p95 = stats.get_response_time_percentile(0.95)
    err_pct = (stats.num_failures / stats.num_requests) * 100
    print(f"\n📊 Load Test Results")
    print(f"   Total requests : {stats.num_requests}")
    print(f"   Failures       : {stats.num_failures} ({err_pct:.1f}%)")
    print(f"   p95 latency    : {p95:.0f} ms")
    print(f"   RPS            : {stats.current_rps:.1f}")
    if p95 > 2000:
        print(f"❌ FAIL: p95 {p95:.0f}ms > 2000ms threshold")
        environment.process_exit_code = 1
    elif err_pct > 1.0:
        print(f"❌ FAIL: error rate {err_pct:.1f}% > 1% threshold")
        environment.process_exit_code = 1
    else:
        print("✅ PASS: All thresholds met")
