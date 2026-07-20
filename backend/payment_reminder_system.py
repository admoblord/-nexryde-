"""
Automated Payment Reminder & Notification System
Runs as a background job to send payment reminders and handle overdue accounts
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any
import asyncio

class PaymentReminderSystem:
    """Automated system for payment reminders"""
    
    def __init__(self):
        self.reminder_schedule = {
            5: self.send_5_day_reminder,
            1: self.send_1_day_reminder,
            0: self.send_overdue_notification,
            -3: self.send_suspension_warning,
            -7: self.send_suspension_notice,
        }

    async def _payment_subscription_email(self, driver_id: str, subject: str, body: str, tag: str) -> None:
        from services.product_notification_email import notify_user_brevo_email

        await notify_user_brevo_email(
            driver_id,
            subject=subject[:998],
            body_plain=body,
            tags=["nexryde-payment-reminder", tag[:32]],
            respect_notification_channels=False,
        )
    
    async def check_all_subscriptions(self):
        """Check all subscriptions and send reminders"""
        # Get all active subscriptions from database
        # subscriptions = await db.subscriptions.find({"status": {"$in": ["active", "limited"]}}).to_list()
        
        subscriptions = []  # Placeholder
        
        for subscription in subscriptions:
            await self.process_subscription(subscription)
    
    async def process_subscription(self, subscription: Dict[str, Any]):
        """Process individual subscription"""
        if not subscription.get("next_payment_due"):
            return
        
        now = datetime.utcnow()
        due_date = subscription["next_payment_due"]
        days_until_due = (due_date - now).days
        
        # Check if reminder needed
        if days_until_due in self.reminder_schedule:
            handler = self.reminder_schedule[days_until_due]
            await handler(subscription)
        
        # Update subscription status if needed
        if days_until_due <= -7:
            await self.suspend_account(subscription)
        elif days_until_due <= 0:
            await self.limit_access(subscription)
    
    async def send_5_day_reminder(self, subscription: Dict[str, Any]):
        """Send 5-day advance reminder"""
        driver_id = subscription["driver_id"]
        amount = subscription["current_price"]
        due_date = subscription["next_payment_due"].strftime("%B %d, %Y")
        
        message = f"""
📅 PAYMENT REMINDER

Your NexRyde subscription renews in 5 days.

Amount Due: ₦{amount:,}
Due Date: {due_date}

Pay now to avoid any interruption:
[PAY NOW]

Questions? Contact support.

NexRyde Team
        """.strip()
        
        await self.send_notification(driver_id, message, "payment_reminder", "medium")
        await self.send_sms(driver_id, f"NexRyde: Payment of ₦{amount:,} due in 5 days. Pay at nexryde.com/pay")
        await self._payment_subscription_email(
            driver_id,
            "NEXRYDE — Subscription renews in 5 days",
            message,
            "due-5d",
        )
    
    async def send_1_day_reminder(self, subscription: Dict[str, Any]):
        """Send 1-day urgent reminder"""
        driver_id = subscription["driver_id"]
        amount = subscription["current_price"]
        
        message = f"""
⚠️ URGENT: PAYMENT DUE TOMORROW

Your subscription expires tomorrow!

Amount: ₦{amount:,}

Avoid suspension - pay now:
[PAY IMMEDIATELY]

Support: 0XXX XXX XXXX
        """.strip()
        
        await self.send_notification(driver_id, message, "payment_urgent", "high")
        await self.send_sms(driver_id, f"URGENT: NexRyde payment ₦{amount:,} due tomorrow! Pay now.")
        await self.send_push_notification(driver_id, "Payment Due Tomorrow!", message, "payment_due_tomorrow")
        await self._payment_subscription_email(driver_id, "NEXRYDE — Payment due tomorrow", message, "due-1d")
    
    async def send_overdue_notification(self, subscription: Dict[str, Any]):
        """Send overdue payment notice"""
        driver_id = subscription["driver_id"]
        amount = subscription["current_price"]
        
        message = f"""
🚨 PAYMENT OVERDUE

Your subscription payment is overdue.

CURRENT STATUS: Limited Access
You can only accept rides (no new features)

Amount Due: ₦{amount:,}

SUSPENSION IN: 7 days

Pay now to restore full access:
[PAY NOW]

Questions? Call support immediately.
        """.strip()
        
        await self.send_notification(driver_id, message, "payment_overdue", "critical")
        await self.send_sms(driver_id, f"OVERDUE: ₦{amount:,}. Limited access active. Pay within 7 days.")
        await self.send_push_notification(driver_id, "Payment Overdue!", "Limited access active", "payment_overdue")
        await self._payment_subscription_email(driver_id, "NEXRYDE — Subscription payment overdue", message, "overdue")
    
    async def send_suspension_warning(self, subscription: Dict[str, Any]):
        """Send 4-day suspension warning"""
        driver_id = subscription["driver_id"]
        amount = subscription["current_price"]
        days_overdue = 3
        
        message = f"""
🚨 FINAL WARNING

ACCOUNT SUSPENSION IN: 4 DAYS

Payment is {days_overdue} days overdue.

Amount: ₦{amount:,}

After 7 days overdue:
- Account will be SUSPENDED
- ₦2,000 reconnection fee added
- Total: ₦{amount + 2000:,}

PAY IMMEDIATELY:
[PAY NOW]

This is your final warning.
        """.strip()
        
        await self.send_notification(driver_id, message, "suspension_warning", "critical")
        await self.send_sms(driver_id, f"FINAL WARNING: Pay ₦{amount:,} in 4 days or account suspended!")
        await self.send_push_notification(driver_id, "Account Suspension in 4 Days!", message, "suspension_warning")
        await self.send_whatsapp(driver_id, message)
        await self._payment_subscription_email(driver_id, "NEXRYDE — Final subscription warning", message, "warn-suspend")
    
    async def send_suspension_notice(self, subscription: Dict[str, Any]):
        """Send suspension notice"""
        driver_id = subscription["driver_id"]
        amount = subscription["current_price"]
        reconnection_fee = 2000
        total = amount + reconnection_fee
        
        message = f"""
❌ ACCOUNT SUSPENDED

Your NexRyde account has been suspended due to non-payment.

Original Amount: ₦{amount:,}
Reconnection Fee: ₦{reconnection_fee:,}
TOTAL DUE: ₦{total:,}

To reactivate your account:
1. Pay ₦{total:,}
2. Contact support
3. Account will be restored within 24 hours

Pay now:
[PAY ₦{total:,}]

Support: 0XXX XXX XXXX
        """.strip()
        
        await self.send_notification(driver_id, message, "account_suspended", "critical")
        await self.send_sms(driver_id, f"Account SUSPENDED. Pay ₦{total:,} (includes ₦2K fee) to reactivate.")
        await self.send_push_notification(driver_id, "Account Suspended", "Pay to reactivate", "account_suspended")
        await self.send_whatsapp(driver_id, message)
        await self._payment_subscription_email(driver_id, "NEXRYDE — Account suspended (subscription)", message, "suspended")
    
    async def limit_access(self, subscription: Dict[str, Any]):
        """Limit account access (days 0-7 overdue)"""
        driver_id = subscription["driver_id"]
        
        # Update database
        # await db.subscriptions.update_one(
        #     {"driver_id": driver_id},
        #     {"$set": {"status": "limited"}}
        # )
        
        print(f"Account {driver_id} limited to accept-only mode")
    
    async def suspend_account(self, subscription: Dict[str, Any]):
        """Suspend account (7+ days overdue)"""
        driver_id = subscription["driver_id"]
        
        # Update database
        # await db.subscriptions.update_one(
        #     {"driver_id": driver_id},
        #     {"$set": {
        #         "status": "suspended",
        #         "reconnection_fee_required": True
        #     }}
        # )
        
        print(f"Account {driver_id} SUSPENDED")
    
    async def send_notification(self, driver_id: str, message: str, type: str, priority: str):
        """Send in-app notification"""
        # await db.notifications.insert_one({
        #     "driver_id": driver_id,
        #     "message": message,
        #     "type": type,
        #     "priority": priority,
        #     "timestamp": datetime.utcnow(),
        #     "read": False
        # })
        pass
    
    async def send_sms(self, driver_id: str, message: str):
        """Send SMS (no provider configured; stub)."""
        # Use existing SMS service
        pass
    
    async def send_push_notification(self, driver_id: str, title: str, body: str, notification_type: str):
        """Send push (and optional Brevo email mirror) via notification_service."""
        from notification_service import send_push_notification

        await send_push_notification(
            driver_id,
            title,
            body,
            {"type": notification_type, "screen": "/driver/subscription"},
            source="payment_reminder",
        )
    
    async def send_whatsapp(self, driver_id: str, message: str):
        """Send WhatsApp message"""
        # Use existing WhatsApp service
        pass

# Background job runner
async def payment_reminder_job():
    """Background job to check payments and send reminders"""
    system = PaymentReminderSystem()
    
    while True:
        try:
            print(f"[{datetime.utcnow()}] Running payment reminder check...")
            await system.check_all_subscriptions()
            print(f"[{datetime.utcnow()}] Payment reminder check complete")
        except Exception as e:
            print(f"Error in payment reminder job: {e}")
        
        # Run every 6 hours
        await asyncio.sleep(6 * 60 * 60)

# Add to FastAPI startup
# @app.on_event("startup")
# async def startup_event():
#     asyncio.create_task(payment_reminder_job())
