"""Authorization contracts for non-AI ID-bearing helper routes."""

import inspect

from routers import gamification, support, users, voice


def _source(fn) -> str:
    return inspect.getsource(fn)


def test_voice_personalization_routes_verify_owner():
    assert "verify_owner_strict(http_request, request.user_id)" in _source(voice.parse_booking_command)
    assert "verify_owner_strict(http_request, user_id)" in _source(voice.get_personalized_context)
    assert "verify_owner_strict(http_request, user_id)" in _source(voice.save_learning_event)


def test_gamification_user_specific_routes_verify_owner_or_admin():
    owner_handlers = [
        gamification.get_driver_challenge_progress,
        gamification.get_driver_certification,
        gamification.get_driver_streaks,
        gamification.check_and_update_streak,
        gamification.get_loyalty_status,
    ]
    for handler in owner_handlers:
        assert "verify_owner_strict(request, user_id)" in _source(handler), handler.__name__

    assert "await require_admin_request(request)" in _source(gamification.add_loyalty_points)
    assert "voter_id = require_authenticated(request)" in _source(gamification.vote_for_driver_of_the_month)


def test_matching_and_phone_lookup_do_not_trust_client_ids():
    assert "verify_owner_strict(request, rider_id)" in _source(support.find_best_matched_driver)
    assert "actor_id = require_authenticated(request)" in _source(users.get_user_by_phone)
    assert "_normalize_phone(actor.get(\"phone\") or \"\") != normalized" in _source(users.get_user_by_phone)
