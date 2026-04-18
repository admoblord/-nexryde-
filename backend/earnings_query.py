"""Mongo query helpers: trips that count toward driver earnings (fare settled)."""


def match_completed_trip_paid_for_earnings(**extra) -> dict:
    """
    Include trips where payment is confirmed, or legacy docs with no payment_status.
    Excludes payment_status 'pending' (cash/wallet awaiting rider confirm).
    """
    return {
        "status": "completed",
        **extra,
        "$or": [
            {"payment_status": "completed"},
            {"payment_status": {"$exists": False}},
        ],
    }
