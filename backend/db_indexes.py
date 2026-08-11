"""MongoDB index definitions for NEXRYDE. Run on startup to ensure optimal query performance."""
import logging

logger = logging.getLogger(__name__)


async def _has_duplicate_values(coll, field: str) -> bool:
    """True if two+ docs share the same non-empty `field` value (would break a
    unique build). Conservative: any error returns True so we never try to enforce
    uniqueness we can't verify."""
    try:
        cur = coll.aggregate([
            {"$match": {field: {"$gt": ""}}},
            {"$group": {"_id": f"${field}", "n": {"$sum": 1}}},
            {"$match": {"n": {"$gt": 1}}},
            {"$limit": 1},
        ])
        async for _ in cur:
            return True
    except Exception:
        return True
    return False


async def _ensure_unique_if_present(coll, field: str):
    """Enforce uniqueness of `field` ONLY among real (non-empty) values, allowing
    unlimited null/absent/"" values.

    Why not sparse+unique: registration writes `email: null` explicitly, and a
    sparse index STILL indexes explicit nulls -- so the 2nd phone-only signup hits
    E11000 (dup key {email: null}). The correct tool is a PARTIAL unique index
    filtered to `{field: {$gt: ""}}` (excludes null, non-strings, and "").

    Safety rules (this runs on every startup, including live prod):
      * Never enforce uniqueness when duplicate real values already exist -- the
        build would fail and could strand the field without an index.
      * Leave a working NON-unique legacy index (prod's phone_1/email_1) untouched:
        it isn't broken (app-layer already enforces uniqueness) and phone lookups
        are login-critical -- no live rebuild churn.
      * Fresh/empty DBs and the broken unique+sparse shape ARE migrated to the
        correct partial-unique index.
    """
    desired_pfe = {field: {"$gt": ""}}
    try:
        info = await coll.index_information()
    except Exception:
        info = {}
    existing_name, existing = None, None
    for name, spec in info.items():
        if name == "_id_":
            continue
        keys = spec.get("key") or []
        if len(keys) == 1 and keys[0][0] == field:
            existing_name, existing = name, spec
            break
    try:
        # Already a partial unique index on this field -- nothing to do.
        if existing and bool(existing.get("unique")) and existing.get("partialFilterExpression"):
            return
        if existing is None:
            try:
                count = await coll.estimated_document_count()
            except Exception:
                count = 0
            if count == 0 or not await _has_duplicate_values(coll, field):
                await coll.create_index(field, unique=True, partialFilterExpression=desired_pfe)
            else:
                logger.warning("Skip unique %s index: duplicate values present", field)
            return
        if bool(existing.get("unique")):
            # Broken unique+sparse / unique-plain shape: 500s explicit nulls. Fix it.
            if not await _has_duplicate_values(coll, field):
                await coll.drop_index(existing_name)
                await coll.create_index(field, unique=True, partialFilterExpression=desired_pfe)
                logger.warning("Migrated %s index '%s' -> partial-unique", field, existing_name)
            else:
                logger.warning("Cannot migrate %s index '%s': duplicates present", field, existing_name)
        else:
            # Non-unique legacy index (prod) -- functional; leave as-is.
            logger.info("Leaving non-unique %s index '%s' as-is (app enforces uniqueness)", field, existing_name)
    except Exception as e:
        logger.warning("ensure unique-if-present %s failed (non-fatal): %s", field, e)


async def ensure_indexes(db):
    """Create indexes on frequently queried fields."""
    try:
        # Users collection -- enforce phone/email uniqueness for REAL values only, so a
        # 2nd phone-only (email:null) or phone-less (phone:"") signup never 500s. Safe
        # on live prod: leaves working non-unique indexes untouched, only fixes the
        # broken unique+sparse shape or provisions fresh DBs. See helper for rationale.
        await _ensure_unique_if_present(db.users, "phone")
        await _ensure_unique_if_present(db.users, "email")
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
        await db.trips.create_index(
            [("driver_id", 1), ("created_at", -1)],
            name="trips_driver_created_desc",
        )
        await db.trips.create_index(
            [("rider_id", 1), ("created_at", -1)],
            name="trips_rider_created_desc",
        )
        # Trips list / filtered history: actor + status + newest first.
        await db.trips.create_index(
            [("driver_id", 1), ("status", 1), ("created_at", -1)],
            name="trips_driver_status_created_desc",
        )
        await db.trips.create_index(
            [("rider_id", 1), ("status", 1), ("created_at", -1)],
            name="trips_rider_status_created_desc",
        )
        await db.trips.create_index([("driver_id", 1), ("completed_at", -1), ("status", 1)])
        await db.trips.create_index("preferred_driver_id", sparse=True)
        await db.trips.create_index([("status", 1), ("fare_locked_until", 1), ("created_at", -1)])
        # Safe-arrival guardian sweeps overdue check-ins every ~20s; without this
        # it collection-scans trips on every tick.
        await db.trips.create_index(
            [
                ("safe_arrival_check.required", 1),
                ("safe_arrival_check.confirmed_at", 1),
                ("safe_arrival_check.emergency_notified_at", 1),
                ("safe_arrival_check.confirm_deadline_at", 1),
            ],
            sparse=True,
            name="trips_safe_arrival_overdue",
        )
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
        
        # Notifications — list + unread badge (user_id, read, created_at)
        await db.notifications.create_index("user_id")
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        await db.notifications.create_index(
            [("user_id", 1), ("read", 1), ("created_at", -1)],
            name="notifications_user_read_created_desc",
        )
        
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

        # Realtime Reliability Platform — durable event log + DLQ (Mongo)
        await db.realtime_event_log.create_index("event_id", unique=True)
        await db.realtime_event_log.create_index([("actor_id", 1), ("ack", 1), ("created_at_ms", 1)])
        await db.realtime_event_log.create_index([("trip_id", 1), ("event_type", 1)])
        await db.realtime_dlq.create_index([("dlq_at_ms", -1)])
        await db.realtime_dlq.create_index("event_id", sparse=True)
        
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
        # TTL must NEVER delete an ACTIVE hold — doing so double-debits on
        # completion (Step 5 fallback re-debits) and strands funds on cancel
        # (release finds no hold and no-ops). Purge only TERMINAL holds: the
        # released/finalized paths set `purge_at`; active (pending/held) rows
        # never get it, so this sparse TTL leaves them untouched.
        try:
            await db.wallet_holds.drop_index("held_at_1")
        except Exception:
            pass
        try:
            await db.wallet_holds.create_index("purge_at", expireAfterSeconds=0, sparse=True)
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

        # Realtime platform — saga retry loop + outbox drain scan by status.
        try:
            await db.trip_sagas.create_index([("status", 1), ("updated_at", 1)])
        except Exception:
            pass
        try:
            await db.realtime_event_outbox.create_index([("status", 1), ("created_at", 1)])
        except Exception:
            pass

        logger.info("MongoDB indexes ensured successfully")
    except Exception as e:
        logger.warning(f"Index creation warning (non-fatal): {e}")
