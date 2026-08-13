"""Unit tests for trip_ws_payload and squad_checkout_parse (no FastAPI / DB)."""

from squad_checkout_parse import (
    extract_squad_checkout_url,
    generate_nexryde_squad_transaction_ref,
    normalize_squad_transaction_ref,
    sanitize_squad_transaction_initiate_payload,
    squad_dynamic_va_response_ok,
    squad_initiate_response_ok,
)
from trip_ws_payload import rider_trip_payload_from_doc


def test_rider_trip_payload_from_doc_shapes():
    doc = {
        "id": "t1",
        "status": "accepted",
        "driver_id": "d1",
        "rider_id": "r1",
        "fare": 1000,
        "offered_fare": 900,
        "pickup_location": {"lat": 1.0, "lng": 2.0, "address": "A"},
        "driver_name": "Ada",
        "vehicle_model": "Camry",
        "vehicle_plate": "ABC",
        "vehicle_color": "Silver",
        "payment_status": "pending",
        "guardian_alert": {"active": True, "type": "abnormal_stop", "check_id": "c1"},
    }
    p = rider_trip_payload_from_doc(doc)
    assert p["id"] == "t1"
    assert p["status"] == "accepted"
    assert p["driver_name"] == "Ada"
    assert p["pickup_location"]["address"] == "A"
    assert p["guardian_alert"]["check_id"] == "c1"


def test_rider_trip_payload_from_doc_empty():
    assert rider_trip_payload_from_doc(None) == {}
    assert rider_trip_payload_from_doc({}).get("id") is None


def test_extract_squad_checkout_url_authorization():
    url = extract_squad_checkout_url(
        {"success": True},
        {"authorization_url": "https://pay.squadco.com/test-ref-auth"},
    )
    assert url == "https://pay.squadco.com/test-ref-auth"


def test_extract_squad_checkout_url_typo_paymant_link():
    url = extract_squad_checkout_url(
        {"success": True},
        {"paymant_link": "https://sandbox-pay.squadco.com/typo-key"},
    )
    assert url == "https://sandbox-pay.squadco.com/typo-key"


def test_extract_squad_checkout_url_list_data():
    url = extract_squad_checkout_url(
        {"success": True, "data": [{"link": "https://checkout.squadco.com/nested"}]},
        {},
    )
    assert url == "https://checkout.squadco.com/nested"


def test_squad_dynamic_va_response_ok():
    assert squad_dynamic_va_response_ok({"success": True, "data": {"account_number": "1"}})
    assert squad_dynamic_va_response_ok({"status": 200, "message": "Success", "data": {}})
    assert not squad_dynamic_va_response_ok({"success": False})


def test_squad_initiate_response_ok_documented_shape():
    assert squad_initiate_response_ok(
        {
            "status": 200,
            "message": "success",
            "data": {"checkout_url": "https://pay.squadco.com/x"},
        }
    )


def test_squad_initiate_response_ok_legacy_success_bool():
    assert squad_initiate_response_ok({"success": True, "data": {}})


def test_squad_initiate_response_ok_false():
    assert not squad_initiate_response_ok({"status": 400, "message": "error"})
    assert not squad_initiate_response_ok(None)


def test_normalize_squad_live_base_rewrites_wrong_host():
    # Keep contract at source level — importing routers.payments needs py3.10+ typing.
    from pathlib import Path
    src = Path(__file__).resolve().parents[1] / "routers" / "payments.py"
    text = src.read_text(encoding="utf-8")
    assert "def _normalize_squad_live_base" in text
    assert '"https://api.squadco.com"' in text
    assert "https://api-d.squadco.com" in text
    yaml = (Path(__file__).resolve().parents[1] / "cloudrun.service.yaml").read_text(encoding="utf-8")
    assert 'value: "https://api-d.squadco.com"' in yaml
    assert 'value: "https://api.squadco.com"' not in yaml


def test_generate_nexryde_squad_transaction_ref_shape():
    r = generate_nexryde_squad_transaction_ref()
    assert 6 <= len(r) <= 50
    assert r.startswith("NEXRYDE_")
    parts = r.split("_")
    assert len(parts) == 3
    assert parts[0] == "NEXRYDE"
    assert parts[1].isdigit()
    assert len(parts[2]) == 6
    assert all(c.isalnum() for c in parts[2])


def test_normalize_squad_transaction_ref_keeps_valid():
    s = "A" * 40
    assert normalize_squad_transaction_ref(s) == s


def test_normalize_squad_transaction_ref_keeps_underscores():
    s = "NEXRYDE_1713029384756_ab12Xy"
    assert normalize_squad_transaction_ref(s) == s


def test_normalize_squad_transaction_ref_regenerates_when_too_long():
    long_ref = "A" * 60
    r = normalize_squad_transaction_ref(long_ref, prefix_fallback="NXCS")
    assert 6 <= len(r) <= 50
    assert r.startswith("NEXRYDE_")


def test_sanitize_squad_transaction_initiate_strips_disallowed_keys():
    dirty = {
        "amount": 50000,
        "email": "a@b.com",
        "currency": "NGN",
        "initiate_type": "inline",
        "transaction_ref": "NEXRYDE_1_abcDef",
        "transactionRef": "SHOULD_DROP",
        "reference": "ALSO_DROP",
        "extra_field": 1,
    }
    clean = sanitize_squad_transaction_initiate_payload(dirty)
    assert clean["transaction_ref"] == "NEXRYDE_1_abcDef"
    assert "transactionRef" not in clean
    assert "reference" not in clean
    assert "extra_field" not in clean
