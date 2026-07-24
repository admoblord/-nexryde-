"""Kafka client config unit tests (no broker required)."""
from __future__ import annotations

import os

from realtime_platform import kafka_client as kc


def test_plaintext_for_localhost(monkeypatch):
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    monkeypatch.delenv("KAFKA_SECURITY_PROTOCOL", raising=False)
    monkeypatch.delenv("KAFKA_SASL_MECHANISM", raising=False)
    assert kc._security_protocol() == "PLAINTEXT"


def test_sasl_ssl_for_managed_bootstrap(monkeypatch):
    monkeypatch.setenv(
        "KAFKA_BOOTSTRAP_SERVERS",
        "bootstrap.managedkafka.us-central1.managedkafka.nexryde-app.cloud.goog:9092",
    )
    monkeypatch.delenv("KAFKA_SECURITY_PROTOCOL", raising=False)
    assert kc._security_protocol() == "SASL_SSL"


def test_explicit_protocol_wins(monkeypatch):
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "broker:9092")
    monkeypatch.setenv("KAFKA_SECURITY_PROTOCOL", "PLAINTEXT")
    assert kc._security_protocol() == "PLAINTEXT"


def test_bootstrap_split(monkeypatch):
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "a:9092, b:9092")
    assert kc.bootstrap_servers() == ["a:9092", "b:9092"]
