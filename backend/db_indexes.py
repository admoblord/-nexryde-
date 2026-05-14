"""MongoDB index definitions for NEXRYDE. Run on startup to ensure optimal query performance."""
import logging

logger = logging.getLogger(__name__)


async def ensure_indexes(db):
    """Create indexes on frequently queried fields."""
    try:
        # Users collection
        await db.users.create_index("phone", unique=True, sparse=True)
        await db.users.create_index("email", sparse=True)
        await db.users.create_index("role")
        
        # Driver profiles
        await db.driver_profiles.create_index("user_id", unique=True)
        await db.driver_profiles.create_index("is_online")
        
        # Trips
        await db.trips.create_index("rider_id")
        await db.trips.create_index("driver_id")
        await db.trips.create_index("status")
        await db.trips.create_index([("status", 1), ("created_at", -1)])
        await db.trips.create_index([("rider_id", 1), ("status", 1)])
        await db.trips.create_index([("driver_id", 1), ("status", 1)])
        await db.trips.create_index("preferred_driver_id", sparse=True)
        await db.trips.create_index([("status", 1), ("fare_locked_until", 1), ("created_at", -1)])
        
        # Subscriptions
        await db.subscriptions.create_index("driver_id")
        await db.subscriptions.create_index([("driver_id", 1), ("status", 1)])
        await db.subscription_payment_intents.create_index("transaction_ref", unique=True, sparse=True)
        await db.subscription_payment_intents.create_index([("driver_id", 1), ("status", 1), ("created_at", -1)])

        await db.wallet_payment_intents.create_index("transaction_ref", unique=True, sparse=True)
        await db.wallet_payment_intents.create_index([("user_id", 1), ("status", 1), ("created_at", -1)])
        await db.wallet_virtual_accounts.create_index("user_id")
        await db.wallet_virtual_accounts.create_index([("reference", 1)], sparse=True)
        await db.wallet_virtual_accounts.create_index([("account_number", 1)], sparse=True)

        await db.squad_webhook_dlq.create_index("id", unique=True)
        await db.squad_webhook_dlq.create_index([("status", 1), ("created_at", -1)])
        
        # OTP records
        await db.otp_records.create_index("phone")
        await db.otp_records.create_index("created_at", expireAfterSeconds=600)
        
        # Notifications
        await db.notifications.create_index("user_id")
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        
        # Wallets
        await db.wallets.create_index("user_id", unique=True)
        await db.transactions.create_index("payment_intent_id", unique=True, sparse=True)
        await db.transactions.create_index([("user_id", 1), ("created_at", -1)])
        await db.wallet_topup_transactions.create_index("transactionRef", unique=True, sparse=True)
        await db.wallet_topup_transactions.create_index([("userId", 1), ("status", 1), ("createdAt", -1)])
        
        # Ride bids
        await db.ride_bids.create_index("trip_id")
        await db.ride_bids.create_index("driver_id")
        await db.ride_bids.create_index([("status", 1), ("expires_at", 1)])
        await db.ride_bids.create_index([("trip_id", 1), ("status", 1), ("expires_at", 1)])
        
        # Safety and high-write incident collections
        await db.sos_alerts.create_index("id", unique=True, sparse=True)
        await db.sos_alerts.create_index([("trip_id", 1), ("triggered_at", -1)])
        await db.sos_alerts.create_index([("user_id", 1), ("triggered_at", -1)])
        await db.sos_alerts.create_index([("status", 1), ("triggered_at", -1)])
        await db.safety_checks.create_index("id", unique=True, sparse=True)
        await db.safety_checks.create_index([("trip_id", 1), ("triggered_at", -1)])
        await db.safety_checks.create_index([("escalated", 1), ("triggered_at", -1)])
        await db.trip_tracking.create_index([("trip_id", 1), ("timestamp", -1)])
        await db.trip_tracking.create_index([("driver_id", 1), ("timestamp", -1)])

        # Driver-specific dispatch offers
        await db.trip_offers.create_index("id", unique=True)
        await db.trip_offers.create_index([("driver_id", 1), ("status", 1), ("expires_at", 1)])
        await db.trip_offers.create_index([("trip_id", 1), ("driver_id", 1)])
        await db.trip_offers.create_index([("trip_id", 1), ("status", 1)])
        
        # Driver documents archive
        await db.driver_documents.create_index("driver_id", unique=True)
        await db.driver_documents.create_index([("documents.nin.sha256", 1)], sparse=True)
        await db.driver_documents.create_index([("documents.drivers_license.sha256", 1)], sparse=True)
        await db.driver_documents.create_index([("documents.passport_photo.sha256", 1)], sparse=True)
        await db.driver_documents.create_index([("documents.vehicle_registration.sha256", 1)], sparse=True)
        await db.driver_documents.create_index([("documents.vehicle_license.sha256", 1)], sparse=True)
        await db.driver_documents.create_index([("documents.hacking_permit.sha256", 1)], sparse=True)
        await db.driver_documents.create_index([("documents.road_worthiness.sha256", 1)], sparse=True)
        await db.driver_documents.create_index([("documents.insurance.sha256", 1)], sparse=True)
        await db.driver_documents.create_index([("documents.vehicle_front.sha256", 1)], sparse=True)
        await db.driver_documents.create_index([("documents.vehicle_interior.sha256", 1)], sparse=True)
        await db.driver_documents.create_index([("documents.vehicle_ac.sha256", 1)], sparse=True)
        await db.driver_documents.create_index("submitted_at")
        await db.driver_documents.create_index("status")
        
        # Verification audit and approved document snapshots
        await db.driver_document_audit.create_index([("driver_id", 1), ("approved_at", -1)])
        await db.driver_document_audit.create_index([("verification_id", 1), ("approved_at", -1)])
        await db.driver_verification_audit.create_index([("verification_id", 1), ("created_at", -1)])
        await db.driver_verification_audit.create_index([("driver_id", 1), ("created_at", -1)])
        
        # Violations
        await db.violations.create_index("user_id")
        await db.violations.create_index([("user_id", 1), ("violation_type", 1)])
        await db.violations.create_index("created_at")
        
        # Monthly verifications
        await db.monthly_verifications.create_index([("driver_id", 1), ("month", 1)], unique=True)
        
        # Compliance reminders
        await db.compliance_reminders.create_index("key", unique=True)
        await db.compliance_reminders.create_index("created_at", expireAfterSeconds=45 * 24 * 3600)
        
        # Face verifications
        await db.face_verifications.create_index("driver_id")
        await db.face_verifications.create_index([("driver_id", 1), ("timestamp", -1)])
        
        # Appeals
        await db.appeals.create_index("user_id")

        # Push analytics, schedules, A/B (admin notifications platform)
        await db.notification_events.create_index([("user_id", 1), ("created_at", -1)])
        await db.notification_events.create_index([("created_at", -1)])
        await db.notification_events.create_index([("user_id", 1), ("nid", 1)])
        await db.notification_events.create_index("nid", sparse=True)
        await db.notification_events.create_index("status")
        await db.scheduled_notifications.create_index([("sent_at", 1), ("run_at", 1)])
        await db.ab_assignments.create_index([("user_id", 1), ("experiment_key", 1)], unique=True)
        await db.ab_experiments.create_index("key", unique=True)
        await db.admin_broadcasts.create_index([("created_at", -1)])

        await db.daily_notification_slot_log.create_index([("day", 1), ("slot_id", 1)], unique=True)

        # NEXRYDE Shield — disputes & encrypted trip audio (48h TTL)
        await db.shield_disputes.create_index("id", unique=True)
        await db.shield_disputes.create_index("trip_id")
        await db.shield_disputes.create_index([("opened_by", 1), ("created_at", -1)])
        await db.shield_trip_audio.create_index("id", unique=True)
        await db.shield_trip_audio.create_index([("trip_id", 1), ("uploaded_by", 1)], unique=True)
        try:
            await db.shield_trip_audio.create_index("expires_at", expireAfterSeconds=0)
        except Exception:
            pass

        # Cross-instance fare lock snapshots (POST /fare/estimate → POST /trips/request)
        await db.fare_lock_estimates.create_index("id", unique=True)
        try:
            await db.fare_lock_estimates.create_index("expires_at", expireAfterSeconds=0)
        except Exception:
            pass
        
        logger.info("MongoDB indexes ensured successfully")
    except Exception as e:
        logger.warning(f"Index creation warning (non-fatal): {e}")
