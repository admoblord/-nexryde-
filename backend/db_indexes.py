"""MongoDB index definitions for NEXRYDE. Run on startup to ensure optimal query performance."""
import logging

logger = logging.getLogger(__name__)


async def ensure_indexes(db):
    """Create indexes on frequently queried fields."""
    try:
        # Users collection
        await db.users.create_index("phone", unique=True, sparse=True)
        await db.users.create_index("email", unique=True, sparse=True)
        await db.users.create_index("role")
        await db.users.create_index("nin_hash", sparse=True)
        await db.users.create_index("nin_last4", sparse=True)
        
        # Driver profiles — geospatial index for $geoNear dispatch queries
        await db.driver_profiles.create_index("user_id", unique=True)
        await db.driver_profiles.create_index("is_online")
        await db.driver_profiles.create_index([("current_location", "2dsphere")])
        await db.driver_profiles.create_index([("is_online", 1), ("current_location", "2dsphere")])
        await db.driver_profiles.create_index([("is_online", 1), ("online_session_started_at", 1)])
        await db.driver_profiles.create_index([("work_zone_active", 1), ("is_online", 1)])
        await db.driver_profiles.create_index("work_zone_zones.place_id", sparse=True)
        
        # Trips
        await db.trips.create_index("rider_id")
        await db.trips.create_index("driver_id")
        await db.trips.create_index("status")
        await db.trips.create_index([("status", 1), ("created_at", -1)])
        await db.trips.create_index([("rider_id", 1), ("status", 1)])
        await db.trips.create_index([("driver_id", 1), ("status", 1)])
        await db.trips.create_index([("driver_id", 1), ("created_at", -1)])
        await db.trips.create_index([("rider_id", 1), ("created_at", -1)])
        await db.trips.create_index([("driver_id", 1), ("completed_at", -1), ("status", 1)])
        await db.trips.create_index("preferred_driver_id", sparse=True)
        await db.trips.create_index([("status", 1), ("fare_locked_until", 1), ("created_at", -1)])
        # Idempotency: unique index prevents duplicate trips from retried requests
        await db.trips.create_index(
            [("rider_id", 1), ("idempotency_key", 1)],
            unique=True,
            sparse=True,
            name="trips_idempotency_key_unique",
        )
        # Transactions: unique driver ride credit reference
        await db.transactions.create_index("reference", unique=True, sparse=True, name="transactions_reference_unique")
        
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
        
        # Wallets — unique on reference prevents double-credit races on duplicate webhooks
        await db.wallets.create_index("user_id", unique=True)
        await db.transactions.create_index("payment_intent_id", unique=True, sparse=True)
        await db.transactions.create_index("reference", unique=True, sparse=True)
        await db.transactions.create_index([("user_id", 1), ("type", 1), ("reference", 1)], sparse=True)
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
        await db.driver_documents.create_index("nin_hash", sparse=True)
        await db.driver_documents.create_index("license_hash", sparse=True)
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

        # Biometric blobs (separate from users — keeps login fast)
        await db.user_biometrics.create_index("user_id", unique=True)
        await db.user_biometrics.create_index("updated_at")
        
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
        await db.engagement_notification_log.create_index(
            [("user_id", 1), ("day", 1), ("slot_id", 1)],
            unique=True,
            name="engagement_user_day_slot_unique",
        )
        await db.engagement_notification_log.create_index([("day", 1), ("role", 1)])
        await db.engagement_notification_log.create_index([("user_id", 1), ("delivery_status", 1), ("sent_at", -1)])
        await db.engagement_notification_log.create_index([("user_id", 1), ("slot_id", 1), ("delivery_status", 1), ("sent_at", -1)])
        await db.engagement_notification_log.create_index([("notification_type", 1), ("variant_id", 1), ("delivery_status", 1)])
        await db.engagement_notification_log.create_index([("opened_at", -1)], sparse=True)
        await db.engagement_notification_log.create_index([("dismissed_at", -1)], sparse=True)
        await db.engagement_notification_log.create_index([("learning_attributed_at", 1), ("delivery_status", 1), ("sent_at", -1)])
        await db.engagement_area_metric_snapshots.create_index([("area_key", 1), ("created_at", -1)])
        await db.engagement_area_metric_snapshots.create_index("expires_at", expireAfterSeconds=0, sparse=True)
        await db.engagement_notification_config.create_index("id", unique=True)

        # Encrypted PII access audit (NIN / license reveal trail)
        await db.admin_pii_access_log.create_index([("accessed_at", -1)])
        await db.admin_pii_access_log.create_index([("subject_user_id", 1), ("accessed_at", -1)])
        await db.admin_pii_access_log.create_index([("accessed_by", 1), ("accessed_at", -1)])
        await db.admin_pii_access_log.create_index("pii_type")

        await db.daily_notification_slot_log.create_index([("day", 1), ("slot_id", 1)], unique=True)

        # Central notification delivery ledger (atomic dedupe before send)
        await db.notification_delivery_ledger.create_index("delivery_key", unique=True)
        await db.notification_delivery_ledger.create_index(
            [("user_id", 1), ("notification_type", 1), ("role", 1), ("delivery_window", 1), ("created_at", -1)]
        )
        await db.notification_delivery_ledger.create_index([("user_id", 1), ("local_date", 1), ("source", 1), ("status", 1)])
        await db.notification_delivery_ledger.create_index([("trip_id", 1), ("notification_type", 1)], sparse=True)
        try:
            await db.notification_delivery_ledger.create_index("expires_at", expireAfterSeconds=0)
        except Exception:
            pass
        await db.notification_scheduler_locks.create_index("expires_at")

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
        
        # Refresh tokens — indexed for fast lookup + TTL auto-expiry
        await db.refresh_tokens.create_index("token_hash", unique=True)
        await db.refresh_tokens.create_index("user_id")
        await db.refresh_tokens.create_index("expires_at", expireAfterSeconds=0, sparse=True)

        # TTL — data retention (Uber standard: auto-purge aged data)
        # admin_sessions: 30-day TTL
        try:
            await db.admin_sessions.create_index("created_at", expireAfterSeconds=30 * 24 * 3600)
        except Exception:
            pass
        # Admin audit log & announcements
        try:
            await db.admin_audit_log.create_index([("created_at", -1)])
            await db.admin_audit_log.create_index("admin_email")
            await db.admin_announcements.create_index([("created_at", -1)])
            await db.admin_announcements.create_index("active")
            await db.admin_driver_notes.create_index([("driver_id", 1), ("created_at", -1)])
            await db.admin_rider_notes.create_index([("rider_id", 1), ("created_at", -1)])
        except Exception:
            pass
        # notification_events: 30-day TTL
        try:
            await db.notification_events.create_index("expires_at", expireAfterSeconds=0, sparse=True)
            # Backfill: set expires_at on existing docs without it
        except Exception:
            pass
        # trip_tracking GPS pings: 7-day TTL (raw GPS data not needed long-term)
        try:
            await db.trip_tracking.create_index("timestamp", expireAfterSeconds=7 * 24 * 3600)
        except Exception:
            pass
        # violations: 1-year TTL for audit
        try:
            await db.violations.create_index("expires_at", expireAfterSeconds=0, sparse=True)
        except Exception:
            pass

        # Wallet holds — fare reservation at booking, released on cancel
        await db.wallet_holds.create_index([("trip_id", 1), ("rider_id", 1)], unique=True, sparse=True)
        await db.wallet_holds.create_index([("rider_id", 1), ("status", 1)])
        # TTL: auto-purge stale holds after 48h (should have been finalized/released by then)
        try:
            await db.wallet_holds.create_index("held_at", expireAfterSeconds=48 * 3600)
        except Exception:
            pass

        # Wallet debit idempotency — compound unique so concurrent debits for the
        # same trip+user+source resolve to exactly one ledger row.
        try:
            await db.transactions.create_index(
                [("trip_id", 1), ("user_id", 1), ("source", 1)],
                unique=True,
                sparse=True,
                partialFilterExpression={"source": "ride_payment"},
            )
        except Exception:
            pass

        # Subscriptions — fast lookup for expiry watchdog
        await db.subscriptions.create_index([("driver_id", 1), ("status", 1)])
        await db.subscriptions.create_index([("status", 1), ("expires_at", 1)])

        # Driver active_trip_id — index for lock queries
        await db.driver_profiles.create_index("active_trip_id", sparse=True)

        logger.info("MongoDB indexes ensured successfully")
    except Exception as e:
        logger.warning(f"Index creation warning (non-fatal): {e}")
