"""Guard: africa-south1 Cloud Run must egress all-traffic for Atlas NAT allowlist."""
from pathlib import Path

YAML = Path(__file__).resolve().parents[1] / "cloudrun.africa-south1.yaml"


def test_africa_south1_vpc_egress_is_all_traffic():
    text = YAML.read_text(encoding="utf-8")
    assert "run.googleapis.com/vpc-access-egress" in text
    assert 'run.googleapis.com/vpc-access-egress: "all-traffic"' in text
    assert "private-ranges-only" not in text, (
        "private-ranges-only would bypass Cloud NAT; Atlas is allowlisted to NAT IP only "
        "and Mongo would silently time out after deploy."
    )
