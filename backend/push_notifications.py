"""Push notification service using Expo's push API."""
import httpx
import logging
from typing import Optional
from datetime import datetime
from database import db

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_PUSH_TICKET_URL = "https://exp.host/--/api/v2/push/getReceipts"

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
                body_json = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                ticket_data = body_json.get("data") if isinstance(body_json, dict) else None
                ticket = ticket_data if isinstance(ticket_data, dict) else {}
                ticket_status = str(ticket.get("status") or "").lower()
                ticket_details = ticket.get("details") if isinstance(ticket.get("details"), dict) else {}
                if ticket_status == "error":
                    err = str(ticket.get("message") or "")
                    code = str(ticket_details.get("error") or "")
                    if code in {"DeviceNotRegistered", "InvalidCredentials"}:
                        await db.users.update_one(
                            {"id": user_id, "push_token": token},
                            {"$unset": {"push_token": ""}, "$set": {"push_token_invalidated_at": datetime.utcnow()}}
                        )
                        logger.warning(f"Push token invalidated for {user_id}: {code}")
                    else:
                        logger.warning(f"Push ticket error for {user_id}: {err or code}")
                    return False
                logger.info(f"Push sent to {user_id}: {title}")
                return True
            logger.warning(f"Push failed for {user_id}: {resp.text}")
    except Exception as e:
        logger.warning(f"Push error for {user_id}: {e}")
    return False
