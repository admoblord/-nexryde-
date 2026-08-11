"""Unit tests for hot_cache key helpers."""
from hot_cache import (
    driver_profile_key,
    fare_config_key,
    subscription_key,
    work_zone_config_key,
    work_zone_driver_key,
)


def test_hot_cache_keys():
    assert work_zone_config_key().startswith("hot:work_zone:config")
    assert work_zone_driver_key("d1") == "hot:work_zone:driver:d1"
    assert driver_profile_key("d1") == "hot:driver_profile:d1"
    assert subscription_key("d1") == "hot:subscription:d1"
    assert fare_config_key("lagos") == "hot:fare_config:lagos"
