"""Background processing for scheduled admin/campaign pushes."""
import asyncio
import logging
from datetime import datetime, timezone

from database import db
from notification_daily_slots import tick_daily_slot_notifications
from notification_service import get_user_ids_for_broadcast_target, send_push_notification

logger = logging.getLogger(__name__)

_scheduler_task = None


async def process_due_scheduled_notifications() -> int:
    """Send scheduled notifications whose run_at has passed. Returns count processed."""
    now = datetime.now(timezone.utc)
    due = await db.scheduled_notifications.find({"sent_at": None, "run_at": {"$lte": now}}).to_list(50)
    processed = 0
    for job in due:
        jid = job.get("id")
        try:
            uids = job.get("user_ids") or []
            if not uids and job.get("target"):
                uids = await get_user_ids_for_broadcast_target(str(job.get("target")))
            title = str(job.get("title") or "NEXRYDE")
            body = str(job.get("body") or "")
            data = job.get("data") if isinstance(job.get("data"), dict) else {}
            data = {**data, "type": str(data.get("type") or job.get("notif_type") or "admin_broadcast")}
            sem = asyncio.Semaphore(40)

            async def one(uid: str):
                async with sem:
                    await send_push_notification(uid, title, body, data, source="scheduled")

            await asyncio.gather(*(one(uid) for uid in uids[:20_000]), return_exceptions=True)
            await db.scheduled_notifications.update_one(
                {"id": jid},
                {"$set": {"sent_at": datetime.now(timezone.utc).isoformat()}},
            )
            processed += 1
        except Exception as e:
            logger.warning("scheduled notification job failed id=%s: %s", jid, e)
    return processed


async def scheduled_notification_loop():
    await asyncio.sleep(5)
    while True:
        try:
            await process_due_scheduled_notifications()
            await tick_daily_slot_notifications()
        except Exception:
            logger.exception("scheduled_notification_loop tick failed")
        await asyncio.sleep(45)


def start_notification_scheduler():
    global _scheduler_task
    if _scheduler_task is None:
        _scheduler_task = asyncio.create_task(scheduled_notification_loop())
        logger.info("Notification scheduler loop started")
