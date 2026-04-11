"""Push notification service using Expo's push API."""
import httpx
import logging
from typing import Optional
from database import db

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

async def send_push_notification(
    user_id: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
):
    """Send push notification to a user via Expo push service."""
    user = await db.users.find_one({"id": user_id}, {"push_token": 1})
    token = (user or {}).get("push_token")
    if not token:
        return False
    
    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "priority": "high",
    }
    if data:
        payload["data"] = data

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(EXPO_PUSH_URL, json=payload, timeout=10)
            if resp.status_code == 200:
                logger.info(f"Push sent to {user_id}: {title}")
                return True
            logger.warning(f"Push failed for {user_id}: {resp.text}")
    except Exception as e:
        logger.warning(f"Push error for {user_id}: {e}")
    return False
