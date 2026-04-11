"""Per-endpoint authorization guard. Verifies the authenticated user matches the requested resource."""
from fastapi import Request, HTTPException


def verify_owner(request: Request, user_id: str):
    """Verify the authenticated user is accessing their own resource.
    Call this at the start of any endpoint that takes a user_id parameter.
    Skips check if no auth state is set (backwards compatibility during migration)."""
    auth_user_id = getattr(request.state, "user_id", None)
    if auth_user_id and auth_user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to access this resource",
        )


def require_authenticated(request: Request) -> str:
    auth_user_id = getattr(request.state, "user_id", None)
    if not auth_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return auth_user_id


def verify_owner_strict(request: Request, user_id: str):
    auth_user_id = require_authenticated(request)
    if auth_user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to access this resource",
        )


def verify_trip_participant(request: Request, trip: dict):
    auth_user_id = require_authenticated(request)
    if auth_user_id not in {trip.get("rider_id"), trip.get("driver_id")}:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to access this trip",
        )
