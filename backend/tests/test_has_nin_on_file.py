"""NIN-on-file detection after PII encryption clears plaintext."""
from pii_encryption import has_nin_on_file


def test_has_nin_on_file_hash_and_last4_without_plaintext():
    assert has_nin_on_file(
        {
            "nin": None,
            "nin_number": None,
            "nin_hash": "abc123",
            "nin_last4": "9818",
        }
    )


def test_has_nin_on_file_cipher_only():
    assert has_nin_on_file({"nin_cipher": "enc:nin:deadbeef"})


def test_has_nin_on_file_legacy_plaintext():
    assert has_nin_on_file({"nin_number": "12345678901"})


def test_has_nin_on_file_empty():
    assert not has_nin_on_file({})
    assert not has_nin_on_file(None)
    assert not has_nin_on_file({"nin": "", "nin_number": None})
