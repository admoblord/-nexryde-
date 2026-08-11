"""GPS/speed spike trip warnings stay off (false positives from noisy GPS)."""
import routers.trips as trips


def test_speed_spike_warnings_disabled():
    assert trips.ENABLE_SPEED_SPIKE_WARNINGS is False


def test_gps_spoof_spike_warnings_disabled():
    assert trips.ENABLE_GPS_SPOOF_SPIKE_WARNINGS is False
