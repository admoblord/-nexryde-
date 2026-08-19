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


async def _safe_create_index(coll, keys, **kwargs):
    """Create one index. Never abort the rest of ensure_indexes on failure.

    A unique build that hits duplicate keys used to raise out of the single
    try/except around *all* indexes, so later collections (engagement log,
    fare locks, route_cache, trip_events) stayed unindexed and Atlas paged
    QUERY_TARGETING_SCANNED_OBJECTS_PER_RETURNED all day.

    If a unique index cannot be built, fall back to the same keys without
    uniqueness so the query still uses an index.
    """
    label = f"{getattr(coll, 'name', '?')}:{kwargs.get('name') or keys}"
    try:
        await coll.create_index(keys, **kwargs)
        return "ok"
    except Exception as exc:
        logger.warning("index skipped %s: %s", label, exc)
        if not kwargs.get("unique"):
            return "fail"
        fallback = {k: v for k, v in kwargs.items() if k != "unique"}
        # Mongo rejects sparse + partialFilterExpression on the same index.
        if fallback.get("partialFilterExpression"):
            fallback.pop("sparse", None)
        name = fallback.get("name")
        if isinstance(name, str):
            fallback["name"] = (
                name.replace("_unique", "_lookup")
                if "_unique" in name
                else f"{name}_lookup"
            )
        try:
            await coll.create_index(keys, **fallback)
            logger.warning("created non-unique fallback for %s", label)
            return "fallback"
        except Exception as exc2:
            logger.warning("fallback index failed %s: %s", label, exc2)
            return "fail"


async def ensure_indexes(db):
    """Create indexes on frequently queried fields."""
    try:
        # Users collection -- enforce phone/email uniqueness for REAL values only, so a
        # 2nd phone-only (email:null) or phone-less (phone:"") signup never 500s. Safe
        # on live prod: leaves working non-unique indexes untouched, only fixes the
        # broken unique+sparse shape or provisions fresh DBs. See helper for rationale.
        await _ensure_unique_if_present(db.users, "phone")
        await _ensure_unique_if_present(db.users, "email")
        await _safe_create_index(db.users, "role")
        await _safe_create_index(db.users, "nin_hash", sparse=True)
        await _safe_create_index(db.users, "nin_last4", sparse=True)
        
        # Driver profiles — geospatial index for $geoNear dispatch queries
        await _safe_create_index(db.driver_profiles, "user_id", unique=True)
        await _safe_create_index(db.driver_profiles, "is_online")
        await _safe_create_index(db.driver_profiles, [("current_location", "2dsphere")])
        await _safe_create_index(db.driver_profiles, [("is_online", 1), ("current_location", "2dsphere")])
        await _safe_create_index(db.driver_profiles, [("is_online", 1), ("online_session_started_at", 1)])
        await _safe_create_index(db.driver_profiles, [("work_zone_active", 1), ("is_online", 1)])
        await _safe_create_index(db.driver_profiles, "work_zone_zones.place_id", sparse=True)
        
        # Trips
        await _safe_create_index(db.trips, "id", unique=True, name="trips_id_unique")
        await _safe_create_index(db.trips, "rider_id")
        await _safe_create_index(db.trips, "driver_id")
        await _safe_create_index(db.trips, "status")
        await _safe_create_index(db.trips, [("status", 1), ("created_at", -1)])
        await _safe_create_index(db.trips, [("rider_id", 1), ("status", 1)])
        await _safe_create_index(db.trips, [("driver_id", 1), ("status", 1)])
        await _safe_create_index(db.trips, [("driver_id", 1), ("created_at", -1)])
        await _safe_create_index(db.trips, [("rider_id", 1), ("created_at", -1)])
        await _safe_create_index(db.trips, [("driver_id", 1), ("completed_at", -1), ("status", 1)])
        await _safe_create_index(db.trips, "preferred_driver_id", sparse=True)
        await _safe_create_index(db.trips, [("status", 1), ("fare_locked_until", 1), ("created_at", -1)])
        # Safe-arrival guardian sweeps overdue check-ins every ~20s; without this
        # it collection-scans trips on every tick.
        await _safe_create_index(db.trips, 
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
        await _safe_create_index(db.trips, 
            [("rider_id", 1), ("idempotency_key", 1)],
            unique=True,
            sparse=True,
            name="trips_idempotency_key_unique",
        )
        # Transactions: unique driver ride credit reference
        await _safe_create_index(db.transactions, "reference", unique=True, sparse=True, name="transactions_reference_unique")
        
        # Subscriptions
        await _safe_create_index(db.subscriptions, "driver_id")
        await _safe_create_index(db.subscriptions, [("driver_id", 1), ("status", 1)])
        await _safe_create_index(db.subscription_payment_intents, "transaction_ref", unique=True, sparse=True)
        await _safe_create_index(db.subscription_payment_intents, [("driver_id", 1), ("status", 1), ("created_at", -1)])

        await _safe_create_index(db.wallet_payment_intents, "transaction_ref", unique=True, sparse=True)
        await _safe_create_index(db.wallet_payment_intents, [("user_id", 1), ("status", 1), ("created_at", -1)])
        await _safe_create_index(db.wallet_virtual_accounts, "user_id")
        await _safe_create_index(db.wallet_virtual_accounts, [("reference", 1)], sparse=True)
        await _safe_create_index(db.wallet_virtual_accounts, [("account_number", 1)], sparse=True)

        await _safe_create_index(db.squad_webhook_dlq, "id", unique=True)
        await _safe_create_index(db.squad_webhook_dlq, [("status", 1), ("created_at", -1)])
        
        # OTP records
        await _safe_create_index(db.otp_records, "phone")
        await _safe_create_index(db.otp_records, "created_at", expireAfterSeconds=600)
        
        # Notifications
        await _safe_create_index(db.notifications, "user_id")
        await _safe_create_index(db.notifications, [("user_id", 1), ("created_at", -1)])
        
        # Wallets — unique on reference prevents double-credit races on duplicate webhooks
        await _safe_create_index(db.wallets, "user_id", unique=True)
        await _safe_create_index(db.transactions, "payment_intent_id", unique=True, sparse=True)
        await _safe_create_index(db.transactions, "reference", unique=True, sparse=True)
        await _safe_create_index(db.transactions, [("user_id", 1), ("type", 1), ("reference", 1)], sparse=True)
        await _safe_create_index(db.transactions, [("user_id", 1), ("created_at", -1)])
        await _safe_create_index(db.wallet_topup_transactions, "transactionRef", unique=True, sparse=True)
        await _safe_create_index(db.wallet_topup_transactions, [("userId", 1), ("status", 1), ("createdAt", -1)])
        
        # Ride bids
        await _safe_create_index(db.ride_bids, "trip_id")
        await _safe_create_index(db.ride_bids, "driver_id")
        await _safe_create_index(db.ride_bids, [("status", 1), ("expires_at", 1)])
        await _safe_create_index(db.ride_bids, [("trip_id", 1), ("status", 1), ("expires_at", 1)])
        
        # Safety and high-write incident collections
        await _safe_create_index(db.sos_alerts, "id", unique=True, sparse=True)
        await _safe_create_index(db.sos_alerts, [("trip_id", 1), ("triggered_at", -1)])
        await _safe_create_index(db.sos_alerts, [("user_id", 1), ("triggered_at", -1)])
        await _safe_create_index(db.sos_alerts, [("status", 1), ("triggered_at", -1)])
        await _safe_create_index(db.safety_checks, "id", unique=True, sparse=True)
        await _safe_create_index(db.safety_checks, [("trip_id", 1), ("triggered_at", -1)])
        await _safe_create_index(db.safety_checks, [("escalated", 1), ("triggered_at", -1)])
        await _safe_create_index(db.trip_tracking, [("trip_id", 1), ("timestamp", -1)])
        await _safe_create_index(db.trip_tracking, [("driver_id", 1), ("timestamp", -1)])

        # Driver-specific dispatch offers
        await _safe_create_index(db.trip_offers, "id", unique=True)
        await _safe_create_index(db.trip_offers, [("driver_id", 1), ("status", 1), ("expires_at", 1)])
        await _safe_create_index(db.trip_offers, [("trip_id", 1), ("driver_id", 1)])
        await _safe_create_index(db.trip_offers, [("trip_id", 1), ("status", 1)])

        # Realtime Reliability Platform — durable event log + DLQ (Mongo)
        await _safe_create_index(db.realtime_event_log, "event_id", unique=True)
        await _safe_create_index(db.realtime_event_log, [("actor_id", 1), ("ack", 1), ("created_at_ms", 1)])
        await _safe_create_index(db.realtime_event_log, [("trip_id", 1), ("event_type", 1)])
        await _safe_create_index(db.realtime_dlq, [("dlq_at_ms", -1)])
        await _safe_create_index(db.realtime_dlq, "event_id", sparse=True)
        
        # Driver documents archive
        await _safe_create_index(db.driver_documents, "driver_id", unique=True)
        await _safe_create_index(db.driver_documents, "nin_hash", sparse=True)
        await _safe_create_index(db.driver_documents, "license_hash", sparse=True)
        await _safe_create_index(db.driver_documents, [("documents.nin.sha256", 1)], sparse=True)
        await _safe_create_index(db.driver_documents, [("documents.drivers_license.sha256", 1)], sparse=True)
        await _safe_create_index(db.driver_documents, [("documents.passport_photo.sha256", 1)], sparse=True)
        await _safe_create_index(db.driver_documents, [("documents.vehicle_registration.sha256", 1)], sparse=True)
        await _safe_create_index(db.driver_documents, [("documents.vehicle_license.sha256", 1)], sparse=True)
        await _safe_create_index(db.driver_documents, [("documents.hacking_permit.sha256", 1)], sparse=True)
        await _safe_create_index(db.driver_documents, [("documents.road_worthiness.sha256", 1)], sparse=True)
        await _safe_create_index(db.driver_documents, [("documents.insurance.sha256", 1)], sparse=True)
        await _safe_create_index(db.driver_documents, [("documents.vehicle_front.sha256", 1)], sparse=True)
        await _safe_create_index(db.driver_documents, [("documents.vehicle_interior.sha256", 1)], sparse=True)
        await _safe_create_index(db.driver_documents, [("documents.vehicle_ac.sha256", 1)], sparse=True)
        await _safe_create_index(db.driver_documents, "submitted_at")
        await _safe_create_index(db.driver_documents, "status")
        
        # Verification audit and approved document snapshots
        await _safe_create_index(db.driver_document_audit, [("driver_id", 1), ("approved_at", -1)])
        await _safe_create_index(db.driver_document_audit, [("verification_id", 1), ("approved_at", -1)])
        await _safe_create_index(db.driver_verification_audit, [("verification_id", 1), ("created_at", -1)])
        await _safe_create_index(db.driver_verification_audit, [("driver_id", 1), ("created_at", -1)])
        
        # Violations
        await _safe_create_index(db.violations, "user_id")
        await _safe_create_index(db.violations, [("user_id", 1), ("violation_type", 1)])
        await _safe_create_index(db.violations, "created_at")
        
        # Monthly verifications
        await _safe_create_index(db.monthly_verifications, [("driver_id", 1), ("month", 1)], unique=True)
        
        # Compliance reminders
        await _safe_create_index(db.compliance_reminders, "key", unique=True)
        await _safe_create_index(db.compliance_reminders, "created_at", expireAfterSeconds=45 * 24 * 3600)
        
        # Face verifications
        await _safe_create_index(db.face_verifications, "driver_id")
        await _safe_create_index(db.face_verifications, [("driver_id", 1), ("timestamp", -1)])

        # Biometric blobs (separate from users — keeps login fast)
        await _safe_create_index(db.user_biometrics, "user_id", unique=True)
        await _safe_create_index(db.user_biometrics, "updated_at")
        
        # Appeals
        await _safe_create_index(db.appeals, "user_id")

        # Push analytics, schedules, A/B (admin notifications platform)
        await _safe_create_index(db.notification_events, [("user_id", 1), ("created_at", -1)])
        await _safe_create_index(db.notification_events, [("created_at", -1)])
        await _safe_create_index(db.notification_events, [("user_id", 1), ("nid", 1)])
        await _safe_create_index(db.notification_events, "nid", sparse=True)
        await _safe_create_index(db.notification_events, "status")
        await _safe_create_index(db.scheduled_notifications, [("sent_at", 1), ("run_at", 1)])
        await _safe_create_index(db.ab_assignments, [("user_id", 1), ("experiment_key", 1)], unique=True)
        await _safe_create_index(db.ab_experiments, "key", unique=True)
        await _safe_create_index(db.admin_broadcasts, [("created_at", -1)])
        await _safe_create_index(db.engagement_notification_log, 
            [("user_id", 1), ("day", 1), ("slot_id", 1)],
            unique=True,
            name="engagement_user_day_slot_unique",
        )
        await _safe_create_index(db.engagement_notification_log, [("day", 1), ("role", 1)])
        await _safe_create_index(db.engagement_notification_log, [("user_id", 1), ("delivery_status", 1), ("sent_at", -1)])
        await _safe_create_index(db.engagement_notification_log, [("user_id", 1), ("slot_id", 1), ("delivery_status", 1), ("sent_at", -1)])
        await _safe_create_index(db.engagement_notification_log, [("notification_type", 1), ("variant_id", 1), ("delivery_status", 1)])
        await _safe_create_index(db.engagement_notification_log, [("opened_at", -1)], sparse=True)
        await _safe_create_index(db.engagement_notification_log, [("user_id", 1), ("opened_at", 1)], sparse=True)
        await _safe_create_index(db.engagement_notification_log, [("dismissed_at", -1)], sparse=True)
        await _safe_create_index(db.engagement_notification_log, [("learning_attributed_at", 1), ("delivery_status", 1), ("sent_at", -1)])
        # Learning attribution sweep: {delivery_status, learning_attributed_at:{$exists:false}}
        await _safe_create_index(
            db.engagement_notification_log,
            [("delivery_status", 1), ("learning_attributed_at", 1), ("sent_at", -1)],
            name="engagement_delivery_learning_sent",
        )
        await _safe_create_index(db.engagement_area_metric_snapshots, [("area_key", 1), ("created_at", -1)])
        await _safe_create_index(db.engagement_area_metric_snapshots, "expires_at", expireAfterSeconds=0, sparse=True)
        await _safe_create_index(db.engagement_notification_config, "id", unique=True)

        # Encrypted PII access audit (NIN / license reveal trail)
        await _safe_create_index(db.admin_pii_access_log, [("accessed_at", -1)])
        await _safe_create_index(db.admin_pii_access_log, [("subject_user_id", 1), ("accessed_at", -1)])
        await _safe_create_index(db.admin_pii_access_log, [("accessed_by", 1), ("accessed_at", -1)])
        await _safe_create_index(db.admin_pii_access_log, "pii_type")

        await _safe_create_index(db.daily_notification_slot_log, [("day", 1), ("slot_id", 1)], unique=True)

        # Central notification delivery ledger (atomic dedupe before send)
        await _safe_create_index(db.notification_delivery_ledger, "delivery_key", unique=True)
        await _safe_create_index(db.notification_delivery_ledger, 
            [("user_id", 1), ("notification_type", 1), ("role", 1), ("delivery_window", 1), ("created_at", -1)]
        )
        await _safe_create_index(db.notification_delivery_ledger, [("user_id", 1), ("local_date", 1), ("source", 1), ("status", 1)])
        await _safe_create_index(db.notification_delivery_ledger, [("trip_id", 1), ("notification_type", 1)], sparse=True)
        try:
            await _safe_create_index(db.notification_delivery_ledger, "expires_at", expireAfterSeconds=0)
        except Exception:
            pass
        await _safe_create_index(db.notification_scheduler_locks, "expires_at")

        # NEXRYDE Shield — disputes & encrypted trip audio (48h TTL)
        await _safe_create_index(db.shield_disputes, "id", unique=True)
        await _safe_create_index(db.shield_disputes, "trip_id")
        await _safe_create_index(db.shield_disputes, [("opened_by", 1), ("created_at", -1)])
        await _safe_create_index(db.shield_trip_audio, "id", unique=True)
        await _safe_create_index(db.shield_trip_audio, [("trip_id", 1), ("uploaded_by", 1)], unique=True)
        try:
            await _safe_create_index(db.shield_trip_audio, "expires_at", expireAfterSeconds=0)
        except Exception:
            pass

        # Cross-instance fare lock snapshots (POST /fare/estimate → POST /trips/request)
        await _safe_create_index(db.fare_lock_estimates, "id", unique=True)
        try:
            await _safe_create_index(db.fare_lock_estimates, "expires_at", expireAfterSeconds=0)
        except Exception:
            pass
        
        # Refresh tokens — indexed for fast lookup + TTL auto-expiry
        await _safe_create_index(db.refresh_tokens, "token_hash", unique=True)
        await _safe_create_index(db.refresh_tokens, "user_id")
        await _safe_create_index(db.refresh_tokens, "expires_at", expireAfterSeconds=0, sparse=True)

        # TTL — data retention (Uber standard: auto-purge aged data)
        # admin_sessions: 30-day TTL
        try:
            await _safe_create_index(db.admin_sessions, "created_at", expireAfterSeconds=30 * 24 * 3600)
        except Exception:
            pass
        # Admin audit log & announcements
        try:
            await _safe_create_index(db.admin_audit_log, [("created_at", -1)])
            await _safe_create_index(db.admin_audit_log, "admin_email")
            await _safe_create_index(db.admin_announcements, [("created_at", -1)])
            await _safe_create_index(db.admin_announcements, "active")
            await _safe_create_index(db.admin_driver_notes, [("driver_id", 1), ("created_at", -1)])
            await _safe_create_index(db.admin_rider_notes, [("rider_id", 1), ("created_at", -1)])
        except Exception:
            pass
        # notification_events: 30-day TTL
        try:
            await _safe_create_index(db.notification_events, "expires_at", expireAfterSeconds=0, sparse=True)
            # Backfill: set expires_at on existing docs without it
        except Exception:
            pass
        # trip_tracking GPS pings: 7-day TTL (raw GPS data not needed long-term)
        try:
            await _safe_create_index(db.trip_tracking, "timestamp", expireAfterSeconds=7 * 24 * 3600)
        except Exception:
            pass
        # violations: 1-year TTL for audit
        try:
            await _safe_create_index(db.violations, "expires_at", expireAfterSeconds=0, sparse=True)
        except Exception:
            pass

        # Wallet holds — fare reservation at booking, released on cancel
        await _safe_create_index(db.wallet_holds, [("trip_id", 1), ("rider_id", 1)], unique=True, sparse=True)
        await _safe_create_index(db.wallet_holds, [("rider_id", 1), ("status", 1)])
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
            await _safe_create_index(db.wallet_holds, "purge_at", expireAfterSeconds=0, sparse=True)
        except Exception:
            pass

        # Wallet debit idempotency — compound unique so concurrent debits for the
        # same trip+user+source resolve to exactly one ledger row.
        try:
            await _safe_create_index(db.transactions, 
                [("trip_id", 1), ("user_id", 1), ("source", 1)],
                unique=True,
                sparse=True,
                partialFilterExpression={"source": "ride_payment"},
            )
        except Exception:
            pass

        # Subscriptions — fast lookup for expiry watchdog
        await _safe_create_index(db.subscriptions, [("driver_id", 1), ("status", 1)])
        await _safe_create_index(db.subscriptions, [("status", 1), ("expires_at", 1)])

        # Driver active_trip_id — index for lock queries
        await _safe_create_index(db.driver_profiles, "active_trip_id", sparse=True)
        # Stacked dispatch: find the driver holding a queued next ride.
        await _safe_create_index(db.driver_profiles, "queued_next_trip_id", sparse=True)

        # Realtime platform — saga retry loop + outbox drain scan by status.
        try:
            await _safe_create_index(db.trip_sagas, [("status", 1), ("updated_at", 1)])
        except Exception:
            pass
        try:
            await _safe_create_index(db.realtime_event_outbox, [("status", 1), ("created_at", 1)])
        except Exception:
            pass

        # Atlas Performance Advisor (2026-08-15): these shapes COLLSCAN'd on
        # africa-south1 and tripped QUERY_TARGETING_SCANNED_OBJECTS_PER_RETURNED.
        await _safe_create_index(db.route_cache, "key", name="route_cache_key")
        await _safe_create_index(db.route_cache, "route_id", sparse=True, name="route_cache_route_id")
        await _safe_create_index(
            db.trip_events,
            [("trip_id", 1), ("created_at", 1)],
            name="trip_events_trip_created",
        )

        logger.info("MongoDB indexes ensured successfully")
    except Exception as e:
        logger.warning(f"Index creation warning (non-fatal): {e}")
