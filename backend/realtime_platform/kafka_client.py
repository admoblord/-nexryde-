"""Shared Kafka client config for Cloud Run (Managed Kafka / Confluent).

Env:
  KAFKA_BOOTSTRAP_SERVERS   required for Kafka mode
  KAFKA_CLIENT_ID           default nexryde-backend
  KAFKA_SECURITY_PROTOCOL   PLAINTEXT | SASL_SSL | SSL  (default: auto)
  KAFKA_SASL_MECHANISM      OAUTHBEARER | PLAIN | SCRAM-SHA-512
  KAFKA_SASL_USERNAME       for PLAIN / SCRAM
  KAFKA_SASL_PASSWORD       for PLAIN / SCRAM

GCP Managed Service for Apache Kafka (recommended in staging/prod):
  KAFKA_SECURITY_PROTOCOL=SASL_SSL
  KAFKA_SASL_MECHANISM=OAUTHBEARER
  # Uses Application Default Credentials on Cloud Run SA
"""
from __future__ import annotations

import asyncio
import base64
import datetime
import json
import logging
import os
import ssl
import time
from typing import Any, Optional

logger = logging.getLogger("realtime_platform.kafka_client")

TOPICS = (
    "nexryde.presence",
    "nexryde.offers",
    "nexryde.trips",
    "nexryde.saga",
    "nexryde.surge",
)


def bootstrap_servers() -> list[str]:
    raw = (os.environ.get("KAFKA_BOOTSTRAP_SERVERS") or "").strip()
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


def _security_protocol() -> str:
    explicit = (os.environ.get("KAFKA_SECURITY_PROTOCOL") or "").strip().upper()
    if explicit:
        return explicit
    # Managed Kafka / Confluent default to SASL_SSL when bootstrap looks like a host:port
    # without plaintext local override.
    if (os.environ.get("KAFKA_SASL_MECHANISM") or "").strip():
        return "SASL_SSL"
    # Local docker-compose Kafka
    servers = bootstrap_servers()
    if servers and all(s.startswith("localhost") or s.startswith("127.") for s in servers):
        return "PLAINTEXT"
    # Prod/staging Managed Kafka bootstrap is never localhost → SASL_SSL
    if servers:
        return "SASL_SSL"
    return "PLAINTEXT"


def _sasl_mechanism() -> str:
    return (os.environ.get("KAFKA_SASL_MECHANISM") or "OAUTHBEARER").strip().upper()


def _ssl_context() -> Optional[ssl.SSLContext]:
    if _security_protocol() not in ("SASL_SSL", "SSL"):
        return None
    ctx = ssl.create_default_context()
    return ctx


def _b64url(source: str) -> str:
    return base64.urlsafe_b64encode(source.encode("utf-8")).decode("utf-8").rstrip("=")


class GcpOauthTokenProvider:
    """aiokafka AbstractTokenProvider for GCP Managed Kafka (ADC)."""

    HEADER = json.dumps({"typ": "JWT", "alg": "GOOG_OAUTH2_TOKEN"})

    def __init__(self) -> None:
        import google.auth
        from google.auth.transport.requests import Request

        self._credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        self._request = Request()

    def _sync_token(self) -> str:
        if not self._credentials.valid:
            self._credentials.refresh(self._request)
        creds = self._credentials
        email = getattr(creds, "service_account_email", None) or "google"
        now = datetime.datetime.now(datetime.timezone.utc)
        exp = creds.expiry
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=datetime.timezone.utc)
        token_data = {
            "exp": exp.timestamp(),
            "iat": now.timestamp(),
            "iss": "Google",
            "sub": email,
        }
        return ".".join(
            [
                _b64url(self.HEADER),
                _b64url(json.dumps(token_data)),
                _b64url(creds.token or ""),
            ]
        )

    async def token(self) -> str:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync_token)


def kafka_common_kwargs(*, client_id: Optional[str] = None) -> dict[str, Any]:
    """Kwargs shared by AIOKafkaProducer / AIOKafkaConsumer."""
    servers = bootstrap_servers()
    if not servers:
        raise RuntimeError("KAFKA_BOOTSTRAP_SERVERS is required")

    kwargs: dict[str, Any] = {
        "bootstrap_servers": servers,
        "client_id": client_id or os.environ.get("KAFKA_CLIENT_ID", "nexryde-backend"),
    }
    protocol = _security_protocol()
    kwargs["security_protocol"] = protocol
    ssl_ctx = _ssl_context()
    if ssl_ctx is not None:
        kwargs["ssl_context"] = ssl_ctx

    if protocol.startswith("SASL"):
        mech = _sasl_mechanism()
        kwargs["sasl_mechanism"] = mech
        if mech == "OAUTHBEARER":
            try:
                from aiokafka.abc import AbstractTokenProvider  # type: ignore

                class _Provider(AbstractTokenProvider, GcpOauthTokenProvider):  # type: ignore[misc]
                    pass

                kwargs["sasl_oauth_token_provider"] = _Provider()
            except Exception:
                # Fallback: duck-typed provider (aiokafka only needs async token())
                kwargs["sasl_oauth_token_provider"] = GcpOauthTokenProvider()
            logger.info("kafka: SASL_SSL OAUTHBEARER (GCP ADC)")
        else:
            user = (os.environ.get("KAFKA_SASL_USERNAME") or "").strip()
            password = (os.environ.get("KAFKA_SASL_PASSWORD") or "").strip()
            if not user or not password:
                raise RuntimeError("KAFKA_SASL_USERNAME/PASSWORD required for PLAIN/SCRAM")
            kwargs["sasl_plain_username"] = user
            kwargs["sasl_plain_password"] = password
            logger.info("kafka: %s %s (username auth)", protocol, mech)
    else:
        logger.info("kafka: PLAINTEXT (local/dev)")

    return kwargs


def kafka_configured() -> bool:
    return bool(bootstrap_servers())
