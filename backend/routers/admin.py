"""Admin Router - All admin panel and management endpoints for NEXRYDE."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import hashlib
import logging

from database import db

logger = logging.getLogger('server')
admin_router = APIRouter(prefix="/api", tags=["Admin"])

# ==================== ADMIN ENDPOINTS ====================

# Admin credentials (in production, use secure hashing)
ADMIN_CREDENTIALS = {
    "admin@nexryde.com": "nexryde2025"
}

class AdminLoginRequest(BaseModel):
    email: str
    password: str

@admin_router.post("/admin/login")
async def admin_login(request: AdminLoginRequest):
    """Admin login endpoint"""
    if request.email in ADMIN_CREDENTIALS and ADMIN_CREDENTIALS[request.email] == request.password:
        # Generate a simple token (in production, use JWT)
        token = hashlib.sha256(f"{request.email}{datetime.utcnow().isoformat()}".encode()).hexdigest()
        return {"success": True, "token": token, "email": request.email}
    return {"success": False, "detail": "Invalid credentials"}

@admin_router.get("/admin/overview")
async def admin_overview():
    """Get dashboard overview stats"""
    total_riders = await db.users.count_documents({"role": "rider"})
    total_drivers = await db.users.count_documents({"role": "driver"})
    total_trips = await db.trips.count_documents({})
    completed_trips = await db.trips.count_documents({"status": "completed"})
    
    # Calculate revenue from completed trips
    revenue_pipeline = [
        {"$match": {"status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$fare"}}}
    ]
    revenue_result = await db.trips.aggregate(revenue_pipeline).to_list(1)
    total_revenue = revenue_result[0]["total"] if revenue_result else 0
    
    # Subscription revenue
    active_subs = await db.subscriptions.count_documents({"status": "active"})
    subscription_revenue = active_subs * SUBSCRIPTION_CONFIG["monthly_fee"]
    
    # Today's stats
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_trips = await db.trips.count_documents({"created_at": {"$gte": today_start}})
    today_signups = await db.users.count_documents({"created_at": {"$gte": today_start}})
    
    return {
        "total_riders": total_riders,
        "total_drivers": total_drivers,
        "total_trips": total_trips,
        "completed_trips": completed_trips,
        "total_revenue": total_revenue,
        "subscription_revenue": subscription_revenue,
        "active_subscriptions": active_subs,
        "today_trips": today_trips,
        "today_signups": today_signups
    }

@admin_router.get("/admin/riders")
async def admin_get_riders(limit: int = 100, skip: int = 0):
    """Get all riders with their details"""
    riders = await db.users.find(
        {"role": "rider"},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with trip counts
    for rider in riders:
        rider["total_trips"] = await db.trips.count_documents({"rider_id": rider["id"]})
        rider["blocked"] = rider.get("blocked", False)
    
    return {"riders": riders, "total": len(riders)}

@admin_router.get("/admin/drivers")
async def admin_get_drivers(limit: int = 100, skip: int = 0):
    """Get all drivers with their details"""
    drivers = await db.users.find(
        {"role": "driver"},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with profile and subscription data
    enriched_drivers = []
    for driver in drivers:
        profile = await db.driver_profiles.find_one({"user_id": driver["id"]}, {"_id": 0})
        subscription = await db.subscriptions.find_one(
            {"driver_id": driver["id"]},
            {"_id": 0},
            sort=[("created_at", -1)]
        )
        
        enriched_drivers.append({
            **driver,
            "vehicle": {
                "make": profile.get("vehicle_type") if profile else None,
                "model": profile.get("vehicle_model") if profile else None,
                "plate": profile.get("vehicle_plate") if profile else None,
            } if profile else None,
            "subscription_status": subscription.get("status") if subscription else "none",
            "is_online": profile.get("is_online", False) if profile else False,
            "total_trips": await db.trips.count_documents({"driver_id": driver["id"]}),
            "blocked": driver.get("blocked", False)
        })
    
    return {"drivers": enriched_drivers, "total": len(enriched_drivers)}

@admin_router.get("/admin/trips")
async def admin_get_trips(limit: int = 100, skip: int = 0, status: str = None):
    """Get all trips with details"""
    query = {}
    if status:
        query["status"] = status
    
    trips = await db.trips.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with user names
    enriched_trips = []
    for trip in trips:
        rider = await db.users.find_one({"id": trip.get("rider_id")}, {"name": 1, "_id": 0})
        driver = await db.users.find_one({"id": trip.get("driver_id")}, {"name": 1, "_id": 0}) if trip.get("driver_id") else None
        
        enriched_trips.append({
            **trip,
            "rider_name": rider.get("name") if rider else "Unknown",
            "driver_name": driver.get("name") if driver else None,
            "pickup": {"address": trip.get("pickup_location", {}).get("address", "N/A")},
            "dropoff": {"address": trip.get("dropoff_location", {}).get("address", "N/A")}
        })
    
    return {"trips": enriched_trips, "total": len(enriched_trips)}

@admin_router.get("/admin/payments")
async def admin_get_payments(limit: int = 100, skip: int = 0):
    """Get subscription payments"""
    subscriptions = await db.subscriptions.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with driver names
    payments = []
    approved_count = 0
    pending_count = 0
    total_revenue = 0
    
    for sub in subscriptions:
        driver = await db.users.find_one({"id": sub.get("driver_id")}, {"name": 1, "_id": 0})
        
        status = "approved" if sub.get("status") == "active" else sub.get("status", "pending")
        if status == "approved" or status == "active":
            approved_count += 1
            total_revenue += sub.get("amount", SUBSCRIPTION_CONFIG["monthly_fee"])
        elif status in ["pending", "pending_verification"]:
            pending_count += 1
        
        payments.append({
            "id": sub.get("id"),
            "driver_id": sub.get("driver_id"),
            "driver_name": driver.get("name") if driver else "Unknown",
            "amount": sub.get("amount", SUBSCRIPTION_CONFIG["monthly_fee"]),
            "status": status,
            "screenshot": sub.get("payment_screenshot"),
            "created_at": sub.get("created_at", datetime.utcnow()).isoformat() if isinstance(sub.get("created_at"), datetime) else sub.get("created_at"),
            "payment_submitted_at": sub.get("payment_submitted_at"),
            "auto_approved": sub.get("auto_approved", False)
        })
    
    return {
        "payments": payments,
        "approved_count": approved_count,
        "pending_count": pending_count,
        "total_revenue": total_revenue
    }

@admin_router.post("/admin/subscriptions/{subscription_id}/approve")
async def admin_approve_subscription(subscription_id: str):
    """Manually approve a subscription payment"""
    result = await db.subscriptions.update_one(
        {"id": subscription_id},
        {"$set": {
            "status": "active",
            "payment_verified_at": datetime.utcnow(),
            "end_date": datetime.utcnow() + timedelta(days=30)
        }}
    )
    
    if result.modified_count > 0:
        return {"success": True, "message": "Subscription approved"}
    return {"success": False, "message": "Subscription not found"}

@admin_router.post("/admin/subscriptions/{subscription_id}/reject")
async def admin_reject_subscription(subscription_id: str, reason: str = "Payment verification failed"):
    """Reject a subscription payment"""
    result = await db.subscriptions.update_one(
        {"id": subscription_id},
        {"$set": {
            "status": "rejected",
            "rejection_reason": reason,
            "payment_verified_at": datetime.utcnow()
        }}
    )
    
    if result.modified_count > 0:
        return {"success": True, "message": "Subscription rejected"}
    return {"success": False, "message": "Subscription not found"}

@admin_router.post("/admin/users/{user_id}/block")
async def admin_block_user(user_id: str, block: bool = True):
    """Block or unblock a user"""
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"blocked": block}}
    )
    
    if result.modified_count > 0:
        return {"success": True, "message": f"User {'blocked' if block else 'unblocked'}"}
    return {"success": False, "message": "User not found"}

@admin_router.get("/admin/promos")
async def admin_get_promos():
    """Get all promo codes"""
    promos = await db.promo_codes.find({}, {"_id": 0}).to_list(100)
    return {"promos": promos}

@admin_router.post("/admin/promo/create")
async def create_promo_code(code: str, discount_percent: int = 10, max_uses: int = 1000):
    """Create a new promo code"""
    promo = {
        "code": code.upper(),
        "discount_percent": discount_percent,
        "max_uses": max_uses,
        "active": True,
        "used_by": [],
        "created_at": datetime.utcnow()
    }
    await db.promo_codes.update_one(
        {"code": code.upper()},
        {"$set": promo},
        upsert=True
    )
    return {"success": True, "code": code.upper(), "discount_percent": discount_percent}

@admin_router.post("/admin/promo/{code}/toggle")
async def admin_toggle_promo(code: str):
    """Toggle promo code active status"""
    promo = await db.promo_codes.find_one({"code": code.upper()})
    if promo:
        new_status = not promo.get("active", True)
        await db.promo_codes.update_one(
            {"code": code.upper()},
            {"$set": {"active": new_status}}
        )
        return {"success": True, "active": new_status}
    return {"success": False, "message": "Promo code not found"}


# ============================================================================
# ADMIN PRICING CONTROL ENDPOINTS (NEXRYDE DYNAMIC PRICING)
# ============================================================================

@admin_router.get("/admin/pricing/current")
async def admin_get_current_pricing():
    """Get current subscription pricing configuration"""
    config = await db.system_config.find_one({"key": "subscription_pricing"})
    
    if not config:
        # Return default configuration
        return {
            "current_phase": "early",
            "current_price": 18000,
            "launch_drivers_count": 0,
            "launch_driver_limit": 500,
            "phase_prices": {
                "launch": 15000,
                "early": 18000,
                "growth": 20000,
                "premium": 25000
            },
            "trial_duration_hours": 24,
            "trial_trip_limit": 3,
            "phase_start_date": datetime.utcnow().isoformat()
        }
    
    config.pop("_id", None)
    return config

@admin_router.post("/admin/pricing/set-phase")
async def admin_set_pricing_phase(request: Dict[str, Any]):
    """
    Change the current subscription phase
    Body: {"phase": "launch|early|growth|premium"}
    """
    phase = request.get("phase")
    valid_phases = ["launch", "early", "growth", "premium"]
    
    if phase not in valid_phases:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid phase. Must be one of: {', '.join(valid_phases)}"
        )
    
    # Map phase to price
    phase_prices = {
        "launch": 15000,
        "early": 18000,
        "growth": 20000,
        "premium": 25000
    }
    
    new_price = phase_prices[phase]
    
    # Update system configuration
    await db.system_config.update_one(
        {"key": "subscription_pricing"},
        {
            "$set": {
                "current_phase": phase,
                "current_price": new_price,
                "phase_start_date": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
        },
        upsert=True
    )
    
    # Log activity
    await db.admin_activity.insert_one({
        "action": "pricing_phase_changed",
        "old_phase": request.get("old_phase"),
        "new_phase": phase,
        "new_price": new_price,
        "timestamp": datetime.utcnow(),
        "admin_note": f"Pricing phase changed to {phase.upper()} (₦{new_price:,})"
    })
    
    return {
        "success": True,
        "message": f"Pricing phase updated to {phase.upper()}",
        "current_phase": phase,
        "current_price": new_price,
        "phase_prices": phase_prices
    }

@admin_router.post("/admin/pricing/update-price")
async def admin_update_phase_price(request: Dict[str, Any]):
    """
    Update price for a specific phase
    Body: {"phase": "launch", "new_price": 15000}
    """
    phase = request.get("phase")
    new_price = request.get("new_price")
    
    valid_phases = ["launch", "early", "growth", "premium"]
    
    if phase not in valid_phases:
        raise HTTPException(status_code=400, detail="Invalid phase")
    
    if not isinstance(new_price, int) or new_price < 5000 or new_price > 50000:
        raise HTTPException(
            status_code=400, 
            detail="Price must be between ₦5,000 and ₦50,000"
        )
    
    # Update the phase price in system config
    config = await db.system_config.find_one({"key": "subscription_pricing"})
    
    if config:
        phase_prices = config.get("phase_prices", {})
        phase_prices[phase] = new_price
        
        await db.system_config.update_one(
            {"key": "subscription_pricing"},
            {
                "$set": {
                    f"phase_prices.{phase}": new_price,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # If updating current phase, also update current_price
        if config.get("current_phase") == phase:
            await db.system_config.update_one(
                {"key": "subscription_pricing"},
                {"$set": {"current_price": new_price}}
            )
    
    # Log activity
    await db.admin_activity.insert_one({
        "action": "phase_price_updated",
        "phase": phase,
        "new_price": new_price,
        "timestamp": datetime.utcnow(),
        "admin_note": f"{phase.upper()} phase price updated to ₦{new_price:,}"
    })
    
    return {
        "success": True,
        "message": f"{phase.upper()} phase price updated to ₦{new_price:,}",
        "phase": phase,
        "new_price": new_price
    }

@admin_router.get("/admin/pricing/usage-stats")
async def admin_get_pricing_usage_stats():
    """Get statistics on map and SMS usage for cost monitoring"""
    # Map usage stats
    map_usage_today = await db.map_usage.count_documents({
        "timestamp": {"$gte": datetime.utcnow().replace(hour=0, minute=0, second=0)}
    })
    
    # SMS/OTP usage stats
    otp_usage_today = await db.otp_records.count_documents({
        "created_at": {"$gte": datetime.utcnow().replace(hour=0, minute=0, second=0)}
    })
    
    # Get top drivers by map usage
    pipeline = [
        {
            "$match": {
                "timestamp": {"$gte": datetime.utcnow() - timedelta(days=7)}
            }
        },
        {
            "$group": {
                "_id": "$driver_id",
                "total_requests": {"$sum": 1}
            }
        },
        {
            "$sort": {"total_requests": -1}
        },
        {
            "$limit": 10
        }
    ]
    
    top_map_users = await db.map_usage.aggregate(pipeline).to_list(10)
    
    return {
        "map_usage": {
            "today": map_usage_today,
            "estimated_cost_today": map_usage_today * 0.005,  # $0.005 per request estimate
            "top_users_7days": top_map_users
        },
        "otp_usage": {
            "today": otp_usage_today,
            "estimated_cost_today": otp_usage_today * 0.05,  # $0.05 per SMS estimate
        },
        "total_estimated_cost_today": (map_usage_today * 0.005) + (otp_usage_today * 0.05)
    }

@admin_router.post("/admin/pricing/set-driver-limit")
async def admin_set_driver_limit(request: Dict[str, Any]):
    """
    Set maximum driver limit for launch phase
    Body: {"limit": 500}
    """
    limit = request.get("limit")
    
    if not isinstance(limit, int) or limit < 0 or limit > 10000:
        raise HTTPException(
            status_code=400,
            detail="Limit must be between 0 and 10,000"
        )
    
    await db.system_config.update_one(
        {"key": "subscription_pricing"},
        {
            "$set": {
                "launch_driver_limit": limit,
                "updated_at": datetime.utcnow()
            }
        },
        upsert=True
    )
    
    return {
        "success": True,
        "message": f"Launch phase driver limit set to {limit}",
        "launch_driver_limit": limit
    }

@admin_router.get("/admin/sos-alerts")
async def admin_get_sos_alerts():
    """Get all SOS alerts"""
    alerts = await db.sos_alerts.find({}, {"_id": 0}).sort("triggered_at", -1).to_list(100)
    return {"alerts": alerts}

# Serve admin panel via /api/admin-panel for external access through ingress
@admin_router.get("/admin-panel")
async def serve_admin_via_api():
    """Serve admin panel via API route"""
    admin_file = ADMIN_DIR / "index.html"
    if admin_file.exists():
        return FileResponse(admin_file, media_type="text/html")
    raise HTTPException(status_code=404, detail="Admin panel not found")

@admin_router.get("/admin/activity-log")
async def admin_get_activity_log(limit: int = 50):
    """Get recent app activity"""
    # Get recent trips
    recent_trips = await db.trips.find(
        {},
        {"_id": 0, "id": 1, "status": 1, "created_at": 1, "rider_id": 1}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Get recent subscriptions
    recent_subs = await db.subscriptions.find(
        {},
        {"_id": 0, "id": 1, "status": 1, "created_at": 1, "driver_id": 1}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Combine and sort
    activities = []
    for trip in recent_trips:
        activities.append({
            "type": "trip",
            "action": f"Trip {trip.get('status', 'created')}",
            "user_id": trip.get("rider_id"),
            "timestamp": trip.get("created_at"),
            "details": {"trip_id": trip.get("id")}
        })
    
    for sub in recent_subs:
        activities.append({
            "type": "subscription",
            "action": f"Subscription {sub.get('status', 'created')}",
            "user_id": sub.get("driver_id"),
            "timestamp": sub.get("created_at"),
            "details": {"subscription_id": sub.get("id")}
        })
    
    # Sort by timestamp
    activities.sort(key=lambda x: x.get("timestamp", datetime.min), reverse=True)
    
    return {"activities": activities[:limit]}



# ============================================================================
# PERFORMANCE REWARDS SYSTEM ENDPOINTS
# ============================================================================

from performance_rewards import PerformanceRewardsManager

@admin_router.get("/admin/rewards/top-drivers")
async def admin_get_top_drivers(period: str = "monthly", limit: int = 10):
    """Get top performing drivers for rewards"""
    rewards_manager = PerformanceRewardsManager(db)
    
    if period == "monthly":
        top_drivers = await rewards_manager.get_top_drivers_monthly(limit=limit)
    else:
        top_drivers = await rewards_manager.get_top_drivers_monthly(limit=limit)
    
    return {
        "period": period,
        "top_drivers": top_drivers,
        "total_qualified": len(top_drivers)
    }

@admin_router.post("/admin/rewards/grant-free-month")
async def admin_grant_free_month(request: Dict[str, Any]):
    """Manually grant free month to a driver"""
    driver_id = request.get("driver_id")
    reason = request.get("reason", "admin_grant")
    
    if not driver_id:
        raise HTTPException(status_code=400, detail="driver_id required")
    
    rewards_manager = PerformanceRewardsManager(db)
    result = await rewards_manager.grant_free_month(driver_id, reason=reason)
    
    return result

@admin_router.post("/admin/rewards/process-monthly")
async def admin_process_monthly_rewards():
    """Process monthly performance rewards (top 10 drivers)"""
    rewards_manager = PerformanceRewardsManager(db)
    result = await rewards_manager.process_monthly_rewards()
    
    return result

@admin_router.get("/drivers/{driver_id}/rewards")
async def get_driver_rewards(driver_id: str):
    """Get driver's reward history"""
    rewards = await db.rewards_log.find({"driver_id": driver_id}).sort("granted_at", -1).to_list(100)
    
    for reward in rewards:
        reward.pop("_id", None)
    
    return {
        "driver_id": driver_id,
        "total_rewards": len(rewards),
        "rewards": rewards
    }

# ============================================================================
# TRIAL ABUSE PREVENTION ENDPOINTS
# ============================================================================

from trial_abuse_prevention import TrialAbuseDetector, validate_trial_eligibility

@admin_router.post("/auth/validate-trial-eligibility")
async def validate_trial(request: Dict[str, Any]):
    """
    Validate if user is eligible for trial
    Prevents abuse by checking phone, NIN, license, device
    """
    phone = request.get("phone")
    nin = request.get("nin")
    license_number = request.get("license_number")
    device_id = request.get("device_id")
    ip_address = request.get("ip_address")
    
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    
    detector = TrialAbuseDetector(db)
    is_allowed, reason, checks = await detector.comprehensive_trial_check(
        phone=phone,
        nin=nin,
        license_number=license_number,
        device_id=device_id,
        ip_address=ip_address
    )
    
    return {
        "eligible": is_allowed,
        "reason": reason,
        "checks": checks
    }

@admin_router.get("/admin/abuse-prevention/stats")
async def admin_get_abuse_stats():
    """Get trial abuse prevention statistics"""
    detector = TrialAbuseDetector(db)
    stats = await detector.get_abuse_statistics()
    
    return stats

@admin_router.post("/admin/abuse-prevention/blacklist")
async def admin_blacklist_phone(request: Dict[str, Any]):
    """Manually blacklist a phone number"""
    phone = request.get("phone")
    reason = request.get("reason", "admin_blacklist")
    
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    
    detector = TrialAbuseDetector(db)
    await detector.blacklist_phone(phone, reason=reason)
    
    return {
        "success": True,
        "message": f"Phone {phone} has been blacklisted"
    }

@admin_router.get("/admin/abuse-prevention/blacklist")
async def admin_get_blacklist(limit: int = 100):
    """Get blacklisted phone numbers"""
    blacklist = await db.trial_blacklist.find({"status": "active"}).sort("blacklisted_at", -1).to_list(limit)
    
    for entry in blacklist:
        entry.pop("_id", None)
    
    return {
        "total": len(blacklist),
        "blacklist": blacklist
    }

# ============================================================================
# DRIVER REPORT SYSTEM ENDPOINTS
# ============================================================================

from driver_report_system import DriverReportSystem, ReportCategory, ReportSeverity

@admin_router.post("/reports/submit")
async def submit_driver_report(request: Dict[str, Any]):
    """
    Submit a report against a driver
    Available to riders only
    """
    rider_id = request.get("rider_id")
    driver_id = request.get("driver_id")
    trip_id = request.get("trip_id")
    category = request.get("category")
    description = request.get("description", "")
    evidence_urls = request.get("evidence_urls", [])
    
    # Validate required fields
    if not all([rider_id, driver_id, trip_id, category]):
        raise HTTPException(
            status_code=400,
            detail="rider_id, driver_id, trip_id, and category are required"
        )
    
    # Validate category
    valid_categories = [c.value for c in ReportCategory]
    if category not in valid_categories:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {', '.join(valid_categories)}"
        )
    
    report_system = DriverReportSystem(db)
    result = await report_system.submit_report(
        rider_id=rider_id,
        driver_id=driver_id,
        trip_id=trip_id,
        category=category,
        description=description,
        evidence_urls=evidence_urls
    )
    
    return result

@admin_router.get("/reports/driver/{driver_id}")
async def get_driver_reports(driver_id: str, include_resolved: bool = False):
    """Get all reports for a specific driver"""
    report_system = DriverReportSystem(db)
    reports = await report_system.get_driver_reports(driver_id, include_resolved=include_resolved)
    
    return {
        "driver_id": driver_id,
        "total_reports": len(reports),
        "reports": reports
    }

@admin_router.get("/reports/driver/{driver_id}/statistics")
async def get_driver_report_statistics(driver_id: str):
    """Get report statistics for a driver"""
    report_system = DriverReportSystem(db)
    stats = await report_system.get_report_statistics(driver_id)
    
    return stats

@admin_router.get("/admin/reports/all")
async def admin_get_all_reports(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 100
):
    """Get all driver reports (admin only)"""
    query = {}
    
    if status:
        query["status"] = status
    
    if severity:
        query["severity"] = severity
    
    reports = await db.driver_reports.find(query).sort("created_at", -1).to_list(limit)
    
    for report in reports:
        report.pop("_id", None)
    
    return {
        "total": len(reports),
        "reports": reports
    }

@admin_router.post("/admin/reports/{report_id}/resolve")
async def admin_resolve_report(report_id: str, request: Dict[str, Any]):
    """Resolve a driver report (admin only)"""
    resolution_notes = request.get("resolution_notes", "")
    action_taken = request.get("action_taken", "none")
    
    result = await db.driver_reports.update_one(
        {"report_id": report_id},
        {
            "$set": {
                "status": "resolved",
                "resolution_notes": resolution_notes,
                "action_taken": action_taken,
                "resolved_at": datetime.utcnow(),
                "reviewed_by": "admin",
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return {
        "success": True,
        "message": "Report resolved successfully",
        "report_id": report_id
    }

@admin_router.get("/admin/reports/categories")
async def get_report_categories():
    """Get available report categories"""
    categories = [
        {
            "value": cat.value,
            "label": cat.value.replace('_', ' ').title(),
            "severity": CATEGORY_SEVERITY_MAP.get(cat, ReportSeverity.MEDIUM).value
        }
        for cat in ReportCategory
    ]
    
    return {"categories": categories}

# ==================== VEHICLE REGISTRATION ENDPOINT ====================

class VehicleRegistrationRequest(BaseModel):
    """Request model for driver vehicle registration"""
    make: str
    model: str
    year: int
    color: str
    plate_number: str
    category: str  # economy, comfort, premium, xl

# Vehicle category requirements - Updated to be more inclusive
VEHICLE_CATEGORY_REQUIREMENTS = {
    "economy": {
        "name": "Economy",
        "min_year": 2005,  # Accept older vehicles
        "luxury_only": False,
        "earnings_per_km": 150,
    },
    "comfort": {
        "name": "Comfort",
        "min_year": 2015,  # Lowered from 2018
        "luxury_only": False,
        "earnings_per_km": 200,
    },
    "premium": {
        "name": "Premium",
        "min_year": 2020,
        "luxury_only": True,
        "luxury_brands": ["mercedes", "bmw", "lexus", "audi", "porsche", "range rover", "jaguar", "bentley", "rolls royce"],
        "earnings_per_km": 350,
    },
    "xl": {
        "name": "SUV / XL",
        "min_year": 2015,  # Lowered from 2017
        "luxury_only": False,
        "earnings_per_km": 250,
    },
}

@admin_router.post("/drivers/{driver_id}/vehicle")
async def register_driver_vehicle(driver_id: str, request: VehicleRegistrationRequest):
    """Register or update driver's vehicle with category validation"""
    
    # Verify driver exists
    user = await db.users.find_one({"id": driver_id})
    if not user:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    if user.get("role") != "driver":
        raise HTTPException(status_code=400, detail="User is not a driver")
    
    # Validate category
    category_lower = request.category.lower()
    if category_lower not in VEHICLE_CATEGORY_REQUIREMENTS:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {', '.join(VEHICLE_CATEGORY_REQUIREMENTS.keys())}")
    
    category_reqs = VEHICLE_CATEGORY_REQUIREMENTS[category_lower]
    current_year = datetime.utcnow().year
    
    # Validate year
    if request.year < category_reqs["min_year"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Vehicle too old for {category_reqs['name']} category. Must be {category_reqs['min_year']} or newer."
        )
    
    if request.year > current_year + 1:
        raise HTTPException(status_code=400, detail="Invalid vehicle year")
    
    # Validate luxury brand for premium category
    if category_reqs.get("luxury_only"):
        make_lower = request.make.lower()
        is_luxury = any(brand in make_lower for brand in category_reqs.get("luxury_brands", []))
        if not is_luxury:
            raise HTTPException(
                status_code=400,
                detail=f"Premium category requires a luxury brand (Mercedes, BMW, Lexus, Audi, etc.). Your {request.make} does not qualify."
            )
    
    # Create vehicle registration record
    vehicle_data = {
        "make": request.make.strip(),
        "model": request.model.strip(),
        "year": request.year,
        "color": request.color.strip(),
        "plate_number": request.plate_number.strip().upper(),
        "category": category_lower,
        "category_name": category_reqs["name"],
        "earnings_per_km": category_reqs["earnings_per_km"],
        "status": "pending_verification",  # pending_verification, verified, rejected
        "registered_at": datetime.utcnow(),
        "verified_at": None,
        "rejection_reason": None,
    }
    
    # Update driver profile
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "vehicle_type": category_lower,
                "vehicle_model": f"{request.make} {request.model}",
                "vehicle_plate": request.plate_number.strip().upper(),
                "vehicle_color": request.color.strip(),
                "vehicle_year": request.year,
                "vehicle": vehicle_data,
            }
        },
        upsert=True
    )
    
    # Also store in vehicle_registrations collection for admin tracking
    registration_record = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "driver_name": user.get("name", "Unknown"),
        "driver_phone": user.get("phone", ""),
        **vehicle_data,
        "created_at": datetime.utcnow(),
    }
    await db.vehicle_registrations.insert_one(registration_record)
    
    logger.info(f"✅ Vehicle registered for driver {driver_id}: {request.make} {request.model} ({category_lower})")
    
    return {
        "success": True,
        "message": f"Vehicle registered successfully in {category_reqs['name']} category",
        "vehicle": vehicle_data,
        "status": "pending_verification",
        "note": "Our team will verify your vehicle within 24-48 hours."
    }

@admin_router.get("/drivers/{driver_id}/vehicle")
async def get_driver_vehicle(driver_id: str):
    """Get driver's registered vehicle"""
    profile = await db.driver_profiles.find_one({"user_id": driver_id})
    
    if not profile or not profile.get("vehicle"):
        return {
            "has_vehicle": False,
            "message": "No vehicle registered"
        }
    
    return {
        "has_vehicle": True,
        "vehicle": profile.get("vehicle")
    }

@admin_router.get("/admin/vehicle-registrations")
async def get_pending_vehicle_registrations(status: str = None):
    """Admin: Get vehicle registrations (optionally filtered by status)"""
    query = {}
    if status:
        query["status"] = status
    
    registrations = await db.vehicle_registrations.find(query).sort("created_at", -1).to_list(100)
    
    for reg in registrations:
        reg.pop("_id", None)
    
    return {
        "registrations": registrations,
        "total": len(registrations)
    }

@admin_router.put("/admin/vehicle-registrations/{registration_id}/verify")
async def verify_vehicle_registration(registration_id: str, approved: bool = True, rejection_reason: str = None):
    """Admin: Verify or reject a vehicle registration"""
    registration = await db.vehicle_registrations.find_one({"id": registration_id})
    
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")
    
    new_status = "verified" if approved else "rejected"
    
    update_data = {
        "status": new_status,
        "verified_at": datetime.utcnow() if approved else None,
        "rejection_reason": rejection_reason if not approved else None,
    }
    
    # Update registration record
    await db.vehicle_registrations.update_one(
        {"id": registration_id},
        {"$set": update_data}
    )
    
    # Update driver profile
    driver_id = registration.get("driver_id")
    if driver_id:
        await db.driver_profiles.update_one(
            {"user_id": driver_id},
            {"$set": {
                "vehicle.status": new_status,
                "vehicle.verified_at": update_data["verified_at"],
                "vehicle.rejection_reason": update_data["rejection_reason"],
            }}
        )
        
        # Send notification to driver
        user = await db.users.find_one({"id": driver_id})
        if user:
            if approved:
                message = f"🎉 Great news! Your {registration.get('make')} {registration.get('model')} has been verified for {registration.get('category_name')} rides. You can now start accepting trips!"
            else:
                message = f"Your vehicle registration was not approved. Reason: {rejection_reason or 'Did not meet category requirements'}. Please update your vehicle details."
            
            # Store notification
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": driver_id,
                "type": "vehicle_verification",
                "title": "Vehicle Verification " + ("Approved ✅" if approved else "Rejected ❌"),
                "message": message,
                "read": False,
                "created_at": datetime.utcnow()
            })
    
    logger.info(f"Vehicle registration {registration_id} {'approved' if approved else 'rejected'}")
    
    return {
        "success": True,
        "status": new_status,
        "message": f"Vehicle registration {'approved' if approved else 'rejected'}"
    }

@admin_router.get("/drivers/{driver_id}/suspension-status")
async def get_driver_suspension_status(driver_id: str):
    """Check if driver is suspended"""
    suspension = await db.driver_suspensions.find_one({
        "driver_id": driver_id,
        "status": "active"
    })
    
    if not suspension:
        return {
            "is_suspended": False,
            "message": "Driver is in good standing"
        }
    
    suspension.pop("_id", None)
    
    return {
        "is_suspended": True,
        "suspension": suspension
    }

# Import for category severity map
from driver_report_system import CATEGORY_SEVERITY_MAP

@admin_router.get("/api/admin/dashboard")
async def get_admin_dashboard():
    """Get admin dashboard statistics"""
    try:
        # Get counts
        total_users = await db.users.count_documents({})
        total_drivers = await db.driver_profiles.count_documents({})
        online_drivers = await db.driver_profiles.count_documents({"is_online": True})
        total_trips = await db.trips.count_documents({})
        active_trips = await db.trips.count_documents({"status": {"$in": ["accepted", "picked_up", "in_progress"]}})
        completed_trips = await db.trips.count_documents({"status": "completed"})
        
        # Get revenue (sum of all completed trip fares)
        revenue_pipeline = [
            {"$match": {"status": "completed"}},
            {"$group": {"_id": None, "total": {"$sum": "$fare"}}}
        ]
        revenue_result = await db.trips.aggregate(revenue_pipeline).to_list(1)
        total_revenue = revenue_result[0]["total"] if revenue_result else 0
        
        # Get pending verifications
        pending_verifications = await db.driver_profiles.count_documents({"verification_status": "pending"})
        
        # Get pending vehicle registrations
        pending_registrations = await db.vehicle_registrations.count_documents({"status": "pending"})
        
        return {
            "users": {
                "total": total_users,
                "drivers": total_drivers,
                "riders": total_users - total_drivers,
            },
            "drivers": {
                "total": total_drivers,
                "online": online_drivers,
                "offline": total_drivers - online_drivers,
            },
            "trips": {
                "total": total_trips,
                "active": active_trips,
                "completed": completed_trips,
            },
            "revenue": {
                "total": total_revenue,
                "currency": "NGN",
            },
            "pending": {
                "driver_verifications": pending_verifications,
                "vehicle_registrations": pending_registrations,
            }
        }
    except Exception as e:
        logging.error(f"Admin dashboard error: {str(e)}")
        return {
            "users": {"total": 0, "drivers": 0, "riders": 0},
            "drivers": {"total": 0, "online": 0, "offline": 0},
            "trips": {"total": 0, "active": 0, "completed": 0},
            "revenue": {"total": 0, "currency": "NGN"},
            "pending": {"driver_verifications": 0, "vehicle_registrations": 0}
        }

# Seed default promo codes on startup
@admin_router.on_event("startup")
async def seed_promo_codes():
    """Seed default promo codes"""
    default_promos = [
        {"code": "FIRST10", "discount_percent": 10, "max_uses": 10000},
        {"code": "WELCOME20", "discount_percent": 20, "max_uses": 5000},
        {"code": "NEXRYDE50", "discount_percent": 50, "max_uses": 100},
    ]
    for promo in default_promos:
        await db.promo_codes.update_one(
            {"code": promo["code"]},
            {"$setOnInsert": {**promo, "active": True, "used_by": [], "created_at": datetime.utcnow()}},
            upsert=True
        )
    logger.info("Default promo codes seeded")

# Include routers
app.include_router(api_router)
app.include_router(two_tier_router)  # NEW: Two-tier subscription system (MUST BE FIRST)
app.include_router(subscription_router)  # Old single-tier system (keep for backward compatibility)
app.include_router(smart_mode_router)  # NEW: Smart Mode AI for intelligent trip acceptance
app.include_router(route_cache_router)  # NEW: Route caching for API cost protection
app.include_router(route_planner_router)  # NEW: Smart Route Planner for return passengers
app.include_router(map_router)
app.include_router(call_router)
app.include_router(community_router)  # REFACTORED: Community groups, polls, events
app.include_router(safety_router)  # REFACTORED: Area boys, danger zones, alerts
app.include_router(ai_router)  # REFACTORED: All AI features (assistant, coach, traffic, accident, etc.)

# Payment reminder background job
@admin_router.on_event("startup")
async def startup_event():
    """Start background jobs on app startup"""
    asyncio.create_task(payment_reminder_job())
    logger.info("Payment reminder job started")

# Serve admin panel at /admin (local access)
@admin_router.get("/admin")
# ========== GOOGLE MAPS FARE ESTIMATION (REAL DISTANCE + TIME) ==========

class GoogleFareRequest(BaseModel):
    pickup: str
    destination: str
    vehicle_type: str = "economy"
    trip_type: str = "intra"  # intra or inter

@admin_router.post("/api/fares/estimate-google")
async def estimate_fare_google(request: GoogleFareRequest):
    """
    Calculate fare using REAL Google Maps distance and duration
    NO hardcoded prices for inter-city - everything from Google Maps API
    """
    try:
        import googlemaps
        
        # Initialize Google Maps client
        gmaps_key = os.environ.get('GOOGLE_MAPS_API_KEY', '')
        if not gmaps_key:
            raise HTTPException(status_code=500, detail="Google Maps API key not configured")
        
        gmaps = googlemaps.Client(key=gmaps_key)
        
        # Get real distance and duration from Google Maps
        directions_result = gmaps.distance_matrix(
            origins=[request.pickup],
            destinations=[request.destination],
            mode="driving",
            departure_time="now",  # Get real-time traffic data
            traffic_model="best_guess"
        )
        
        if directions_result['rows'][0]['elements'][0]['status'] != 'OK':
            raise HTTPException(status_code=400, detail="Could not calculate route. Please check locations.")
        
        # Extract distance and duration from Google Maps
        element = directions_result['rows'][0]['elements'][0]
        distance_meters = element['distance']['value']
        duration_seconds = element['duration_in_traffic']['value'] if 'duration_in_traffic' in element else element['duration']['value']
        
        distance_km = distance_meters / 1000
        duration_minutes = duration_seconds / 60
        
        # Format for display
        distance_text = element['distance']['text']
        if 'duration_in_traffic' in element:
            duration_text = element['duration_in_traffic']['text']
        else:
            duration_text = element['duration']['text']
        
        # Detect city from pickup location
        pickup_lower = request.pickup.lower()
        city = "lagos"  # Default to Lagos
        if "abuja" in pickup_lower:
            city = "abuja"
        elif "port harcourt" in pickup_lower or "portharcourt" in pickup_lower:
            city = "port_harcourt"
        elif "lagos" in pickup_lower:
            city = "lagos"
        
        # Get pricing configuration for detected city and vehicle type
        if city not in FARE_CONFIG:
            city = "lagos"  # Fallback to Lagos if city not found
        
        if request.vehicle_type not in FARE_CONFIG[city]:
            raise HTTPException(status_code=400, detail=f"Invalid vehicle type: {request.vehicle_type}")
        
        # Get the pricing rates from FARE_CONFIG
        pricing = FARE_CONFIG[city][request.vehicle_type]
        base_fare = pricing["base_fare"]
        per_km = pricing["per_km"]
        per_min = pricing["per_min"]
        booking_fee = pricing["booking_fee"]
        min_fare = pricing["min_fare"]
        
        # Calculate fare using YOUR SYSTEM
        # Formula: Base + (distance × per_km) + (duration × per_min) + booking_fee
        distance_fee = distance_km * per_km
        time_fee = duration_minutes * per_min
        
        total_fare = base_fare + distance_fee + time_fee + booking_fee
        
        # Apply minimum fare if configured
        if min_fare > 0 and total_fare < min_fare:
            total_fare = min_fare
        
        # Get polyline for map display
        polyline = ""
        try:
            directions = gmaps.directions(
                origin=request.pickup,
                destination=request.destination,
                mode="driving",
                departure_time="now"
            )
            if directions and len(directions) > 0:
                polyline = directions[0]['overview_polyline']['points']
        except Exception as e:
            logger.warning(f"Could not get polyline: {str(e)}")
        
        return {
            "pickup": request.pickup,
            "destination": request.destination,
            "distance": distance_text,
            "distance_km": round(distance_km, 2),
            "duration": duration_text,
            "duration_min": round(duration_minutes, 1),
            "base_fare": base_fare,
            "distance_fee": round(distance_fee, 2),
            "time_fee": round(time_fee, 2),
            "booking_fee": booking_fee,
            "per_km_rate": per_km,
            "per_min_rate": per_min,
            "total_fare": round(total_fare, 2),
            "vehicle_type": request.vehicle_type,
            "trip_type": request.trip_type,
            "city": city,
            "polyline": polyline,
            "traffic_considered": 'duration_in_traffic' in element,
            "source": "Google Maps API",
            "pricing_model": f"NEXRYDE {city.upper()} - {request.vehicle_type.upper()}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google Maps fare estimation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate fare: {str(e)}")


# ========== CUSTOM PRICE TRIP API (BID/NEGOTIATE FARE) ==========

class CustomPriceRequest(BaseModel):
    rider_id: str
    pickup: str
    destination: str
    recommended_fare: float
    offered_fare: float
    vehicle_type: str
    trip_type: str = "intra"

@admin_router.post("/api/trips/create-with-custom-price")
async def create_trip_with_custom_price(request: CustomPriceRequest):
    """
    Create trip with user's custom price offer
    Broadcasts to nearby drivers for acceptance
    Allows price negotiation between riders and drivers
    """
    try:
        # Generate unique trip ID
        trip_id = f"trip-{int(time.time() * 1000)}"
        
        # Calculate price difference
        difference_percent = ((request.offered_fare - request.recommended_fare) / request.recommended_fare) * 100
        
        # Create trip with custom pricing
        trip = {
            "id": trip_id,
            "rider_id": request.rider_id,
            "pickup_location": request.pickup,
            "destination": request.destination,
            "recommended_fare": request.recommended_fare,
            "offered_fare": request.offered_fare,
            "final_fare": None,  # Will be set when driver accepts
            "vehicle_type": request.vehicle_type,
            "trip_type": request.trip_type,
            "status": "pending_driver_offers",
            "broadcast_radius_km": 10,
            "difference_percent": round(difference_percent, 1),
            "offers": [],  # Driver counter-offers will be stored here
            "created_at": datetime.now(),
            "expires_at": datetime.now() + timedelta(minutes=10)  # Offer expires in 10 min
        }
        
        # Save to database
        result = await db.trips.insert_one(trip)
        logging.info(f"✅ Custom price trip created: {trip_id} with offer ₦{request.offered_fare}")
        
        # TODO: Broadcast to nearby drivers via push notifications
        # For now, return success with mock driver count
        drivers_notified = 15  # Mock value
        
        return {
            "success": True,
            "trip_id": trip_id,
            "drivers_notified": drivers_notified,
            "message": f"Your offer of ₦{request.offered_fare:,.0f} has been broadcast to {drivers_notified} nearby drivers",
            "recommended_fare": request.recommended_fare,
            "offered_fare": request.offered_fare,
            "difference": request.offered_fare - request.recommended_fare,
            "difference_percent": round(difference_percent, 1)
        }
        
    except Exception as e:
        logging.error(f"❌ Error creating custom price trip: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create custom price trip: {str(e)}")


@admin_router.get("/api/trips/{trip_id}/status")
async def get_trip_status(trip_id: str):
    """Get current trip status - used by rider to track their request"""
    try:
        trip = await db.trips.find_one({"id": trip_id})
        if not trip:
            return {"success": False, "error": "Trip not found"}
        
        trip["_id"] = str(trip["_id"])
        
        # Get driver info if trip is accepted
        driver_info = None
        if trip.get("driver_id") and trip.get("status") in ["accepted", "arrived", "in_progress"]:
            driver = await db.driver_profiles.find_one({"user_id": trip["driver_id"]})
            driver_user = await db.users.find_one({"id": trip["driver_id"]})
            if driver:
                driver_info = {
                    "name": driver.get("full_name") or (driver_user.get("name") if driver_user else "Driver"),
                    "phone": driver.get("phone", ""),
                    "vehicle": f"{driver.get('vehicle_make', '')} {driver.get('vehicle_model', '')}".strip() or "Vehicle",
                    "plate": driver.get("vehicle_plate_number", ""),
                    "color": driver.get("vehicle_color", ""),
                    "rating": driver.get("rating", 4.8),
                }
        
        return {
            "success": True,
            "trip_id": trip_id,
            "status": trip.get("status", "unknown"),
            "offered_fare": trip.get("offered_fare"),
            "pickup": trip.get("pickup_location"),
            "destination": trip.get("destination"),
            "driver_info": driver_info,
            "created_at": str(trip.get("created_at", "")),
        }
    except Exception as e:
        logger.error(f"Trip status error: {str(e)}")
        return {"success": False, "error": str(e)}


# ========== VOICE BOOKING API (NIGERIAN ACCENT SUPPORT) ==========

# Google Places Autocomplete Proxy Endpoint (to avoid CORS issues)
@admin_router.get("/api/places/autocomplete")
async def google_places_autocomplete(
    input: str,
    country: str = "ng",
    language: str = "en"
):
    """
    Proxy endpoint for Google Places Autocomplete API
    Enhanced to search: establishments, neighborhoods, streets, landmarks, businesses
    """
    try:
        google_maps_api_key = os.getenv('GOOGLE_MAPS_API_KEY', 'AIzaSyBmD2u8Nq-guiT3PJKYxdzr5bl-lL6nbsY')
        
        url = f"https://maps.googleapis.com/maps/api/place/autocomplete/json"
        params = {
            'input': input,
            'key': google_maps_api_key,
            'components': f'country:{country}',
            'language': language,
            # Include ALL place types: addresses, establishments, regions
            'types': 'establishment|geocode'  # Searches businesses AND addresses
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=10.0)
            data = response.json()
            
        return data
    except Exception as e:
        logging.error(f"Google Places Autocomplete Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch places: {str(e)}")

class VoiceBookingRequest(BaseModel):
    text: str
    language: str = "en-NG"

@admin_router.post("/api/voice/parse-booking")
async def parse_voice_booking(request: VoiceBookingRequest):
    """
    Parse voice command to extract pickup and destination
    Supports Nigerian English, Pidgin, and ALL Nigerian cities automatically
    """
    text = request.text.lower()
    
    # COMPREHENSIVE Nigerian locations database - ALL CITIES ACROSS NIGERIA
    nigerian_locations = [
        # Lagos State
        'ikorodu', 'lekki', 'victoria island', 'vi', 'ikeja', 'yaba', 'surulere',
        'apapa', 'maryland', 'ojota', 'berger', 'ajah', 'festac', 'isolo', 'mushin',
        'oshodi', 'agege', 'alimosho', 'lagos island', 'banana island', 'ikoyi',
        'gbagada', 'anthony', 'obalende', 'costain', 'iponri', 'ajegunle', 'idimu',
        'egbeda', 'ikotun', 'igando', 'sango', 'iyana ipaja', 'abule egba',
        'mangoro', 'badagry', 'epe', 'ibeju-lekki', 'abraham adesanya',
        'sangotedo', 'awoyaya', 'magodo', 'omole', 'ogba', 'ikosi', 'ketu',
        'mile 2', 'mile 12', 'cele', 'ilasamaja', 'bode thomas', 'onigbongbo',
        'adeniyi jones', 'allen avenue', 'opebi', 'oregun', 'ojodu',
        'mowe', 'ibafo', 'isheri', 'magboro', 'arepo', 'ojo', 'alaba', 'trade fair',
        
        # Abuja (FCT)
        'abuja', 'wuse', 'garki', 'asokoro', 'maitama', 'gwarimpa', 'kubwa',
        'nyanya', 'karu', 'lugbe', 'jabi', 'utako', 'gudu', 'apo', 'lifecamp',
        'gwagwalada', 'bwari', 'kuje', 'jikwoyi', 'jukwoyi', 'katampe', 'mabushi',
        'wuye', 'lokogoma', 'gaduwa', 'dakwo', 'kado', 'durumi', 'area 1', 'area 2',
        'area 3', 'area 11', 'central area', 'central business district', 'cbd',
        
        # Kano State
        'kano', 'sabon gari', 'fagge', 'nassarawa', 'gwale', 'kumbotso', 'ungogo',
        'dawakin tofa', 'bichi', 'rano', 'gwarzo', 'wudil', 'gezawa',
        
        # Rivers State
        'port harcourt', 'ph', 'trans amadi', 'rumuokoro', 'eleme', 'oyigbo',
        'rumuigbo', 'rumuola', 'rumuokwuta', 'diobu', 'mile 1', 'mile 3',
        'abuloma', 'choba', 'alakahia', 'rumukalagbor', 'rumuobiakani', 'airforce',
        
        # Oyo State
        'ibadan', 'bodija', 'agodi', 'dugbe', 'mokola', 'sango', 'challenge',
        'ring road', 'iwo road', 'moniya', 'apete', 'akobo', 'ojoo', 'akala',
        'ologuneru', 'eleyele', 'jericho', 'bashorun', 'oritamefa', 'aleshinloye',
        
        # Ogun State
        'abeokuta', 'ota', 'ifo', 'sango ota', 'agbara', 'sagamu', 'ijebu ode',
        'mowe', 'ibafo', 'magboro', 'arepo', 'ojodu berger',
        
        # Enugu State
        'enugu', 'independence layout', 'trans ekulu', 'achara layout', 'uwani',
        'ogui', 'new haven', 'abakpa', 'emene', 'ninth mile', '9th mile', 'nsukka',
        
        # Anambra State
        'onitsha', 'awka', 'nnewi', 'ekwulobia', 'aguata', 'ihiala', 'upper iweka',
        'main market', 'bridgehead', 'fegge', 'woliwo', 'inland town',
        
        # Abia State
        'aba', 'umuahia', 'ariaria', 'brass street', 'cemetery road', 'port harcourt road',
        'faulks road', 'azikiwe road', 'st michaels', 'eziukwu',
        
        # Delta State
        'warri', 'asaba', 'sapele', 'ughelli', 'effurun', 'okpanam', 'agbor',
        
        # Edo State
        'benin', 'benin city', 'ring road', 'sapele road', 'akpakpava', 'uselu',
        'ugbowo', 'ikpoba hill', 'upper mission', 'new benin', 'amagba',
        
        # Kaduna State
        'kaduna', 'sabon tasha', 'barnawa', 'kakuri', 'ungwan rimi', 'narayi',
        'malali', 'kaduna north', 'zaria', 'sabon gari zaria', 'samaru',
        
        # Plateau State
        'jos', 'bukuru', 'rayfield', 'terminus', 'jenta', 'kwararafa',
        
        # Cross River State
        'calabar', 'marian road', 'mayne avenue', 'parliamentary road', 'uwanse',
        
        # Akwa Ibom State
        'uyo', 'eket', 'ikot ekpene', 'oron', 'abak', 'essien udim',
        
        # Imo State
        'owerri', 'orlu', 'okigwe', 'mbaise', 'orji', 'new owerri', 'wetheral road',
        
        # Kwara State
        'ilorin', 'offa', 'omu aran', 'lafiagi', 'pategi', 'sango', 'challenge',
        
        # Osun State
        'osogbo', 'ile ife', 'ilesa', 'ede', 'ikirun', 'gbongan', 'ila orangun',
        
        # Ondo State
        'akure', 'ondo', 'owo', 'ore', 'okitipupa', 'ikare',
        
        # Ekiti State
        'ado ekiti', 'ikere', 'ijero', 'efon alaaye',
        
        # Benue State
        'makurdi', 'gboko', 'otukpo', 'katsina ala',
        
        # Nasarawa State
        'lafia', 'keffi', 'akwanga', 'nasarawa', 'doma',
        
        # Niger State
        'minna', 'suleja', 'bida', 'kontagora', 'lapai',
        
        # Bauchi State
        'bauchi', 'azare', 'misau', 'jama are', 'tafawa balewa',
        
        # Gombe State
        'gombe', 'kumo', 'dukku', 'billiri',
        
        # Borno State
        'maiduguri', 'bama', 'biu', 'damboa',
        
        # Yobe State
        'damaturu', 'potiskum', 'gashua', 'nguru',
        
        # Sokoto State
        'sokoto', 'tambuwal', 'gwadabawa', 'bodinga',
        
        # Kebbi State
        'birnin kebbi', 'argungu', 'zuru', 'jega',
        
        # Zamfara State
        'gusau', 'kaura namoda', 'talata mafara', 'bungudu',
        
        # Katsina State
        'katsina', 'daura', 'funtua', 'kankia', 'malumfashi',
        
        # Jigawa State
        'dutse', 'hadejia', 'gumel', 'kazaure', 'ringim',
        
        # Taraba State
        'jalingo', 'wukari', 'bali', 'gembu',
        
        # Adamawa State
        'yola', 'jimeta', 'mubi', 'numan', 'ganye',
        
        # Bayelsa State
        'yenagoa', 'sagbama', 'nembe', 'brass', 'ogbia',
        
        # Ebonyi State
        'abakaliki', 'afikpo', 'onueke', 'ezza',
        
        # Kogi State
        'lokoja', 'okene', 'kabba', 'idah', 'ankpa',
    ]
    
    # Normalize and add common variations
    location_variants = {}
    for loc in nigerian_locations:
        # Store original
        location_variants[loc] = loc
        # Add without spaces
        location_variants[loc.replace(' ', '')] = loc
        # Add with hyphens
        location_variants[loc.replace(' ', '-')] = loc
    
    # Patterns to detect pickup and destination
    patterns = {
        'from_to': [
            r'from\s+([a-z\s-]+?)\s+to\s+([a-z\s-]+)',
            r'take me from\s+([a-z\s-]+?)\s+to\s+([a-z\s-]+)',
            r'book me from\s+([a-z\s-]+?)\s+to\s+([a-z\s-]+)',
            r'pick me from\s+([a-z\s-]+?)\s+to\s+([a-z\s-]+)',
            r'going from\s+([a-z\s-]+?)\s+to\s+([a-z\s-]+)',
        ],
        'to_from': [
            r'to\s+([a-z\s-]+?)\s+from\s+([a-z\s-]+)',
            r'go\s+([a-z\s-]+?)\s+from\s+([a-z\s-]+)',
        ],
        'destination_only': [
            r'take me to\s+([a-z\s-]+)',
            r'go to\s+([a-z\s-]+)',
            r'going to\s+([a-z\s-]+)',
            r'i want to go to\s+([a-z\s-]+)',
            r'i wan go\s+([a-z\s-]+)',  # Pidgin
            r'i dey go\s+([a-z\s-]+)',  # Pidgin
            r'book me go\s+([a-z\s-]+)',  # Pidgin
            r'abeg carry me go\s+([a-z\s-]+)',  # Pidgin
            r'i need to go to\s+([a-z\s-]+)',
            r'heading to\s+([a-z\s-]+)',
        ]
    }
    
    import re
    
    pickup = ""
    destination = ""
    
    # Try from-to patterns
    for pattern in patterns['from_to']:
        match = re.search(pattern, text)
        if match:
            pickup = match.group(1).strip()
            destination = match.group(2).strip()
            break
    
    # Try to-from patterns (swap order)
    if not pickup or not destination:
        for pattern in patterns['to_from']:
            match = re.search(pattern, text)
            if match:
                destination = match.group(1).strip()
                pickup = match.group(2).strip()
                break
    
    # Try destination-only patterns (use current location for pickup)
    if not destination:
        for pattern in patterns['destination_only']:
            match = re.search(pattern, text)
            if match:
                destination = match.group(1).strip()
                pickup = "Current Location"
                break
    
    # Validate and clean up locations using fuzzy matching
    def find_closest_location(text: str) -> str:
        """Find the closest matching Nigerian location with fuzzy search"""
        text = text.strip().lower()
        
        # Direct match
        if text in nigerian_locations:
            return text.title()
        
        # Check variants
        if text in location_variants:
            return location_variants[text].title()
        
        # Fuzzy match - check if any location is contained in text
        for location in nigerian_locations:
            if location in text or text in location:
                return location.title()
        
        # Check for partial word matches (e.g., "ikorodu road" -> "ikorodu")
        words = text.split()
        for word in words:
            if word in nigerian_locations:
                return word.title()
            for location in nigerian_locations:
                if word in location or location in word:
                    return location.title()
        
        # Return original with title case if no match
        return text.title()
    
    if destination:
        destination = find_closest_location(destination)
    if pickup and pickup != "Current Location":
        pickup = find_closest_location(pickup)
    
    # If we couldn't parse anything clearly, return error
    if not destination:
        raise HTTPException(status_code=400, detail="Could not detect destination. Please speak clearly and mention the city name.")
    
    return {
        "pickup": pickup if pickup else "Current Location",
        "destination": destination,
        "original_text": request.text,
        "language": request.language,
        "recognized": True
    }


# ==================== COMMUNITY & SAFETY (REFACTORED TO ROUTERS) ====================
# See: routers/community.py and routers/safety.py

@admin_router.on_event("startup")
async def seed_community_and_safety():
    """Seed community groups, content, and danger zones via refactored modules"""
    await seed_community_groups(db)
    await seed_community_content(db)
    await seed_danger_zones(db)



# ==================== DRIVER STORIES ENDPOINTS ====================
# (Community & Safety endpoints moved to routers/community.py and routers/safety.py)

class StoryCreate(BaseModel):
    driver_id: str
    text: str
    mood: str = "happy"
    location: str = "Lagos"

@admin_router.post("/api/driver/stories")
async def create_driver_story(story: StoryCreate):
    """Create a driver story visible to riders"""
    try:
        story_doc = {
            "driver_id": story.driver_id,
            "text": story.text,
            "mood": story.mood,
            "location": story.location,
            "likes": 0,
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": (datetime.utcnow() + timedelta(hours=24)).isoformat(),
        }
        # Get driver name
        user = await db.users.find_one({"id": story.driver_id})
        if user:
            story_doc["driver_name"] = user.get("name", "Anonymous Driver")
        else:
            story_doc["driver_name"] = "Anonymous Driver"
        
        result = await db.driver_stories.insert_one(story_doc)
        story_doc["_id"] = str(result.inserted_id)
        return {"success": True, "story": story_doc}
    except Exception as e:
        logger.error(f"Create story error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@admin_router.get("/api/driver/stories")
async def get_driver_stories(limit: int = 20):
    """Get recent driver stories (visible to both drivers and riders)"""
    try:
        # Get stories from last 24 hours
        cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        cursor = db.driver_stories.find(
            {"created_at": {"$gte": cutoff}}
        ).sort("created_at", -1).limit(limit)
        stories = await cursor.to_list(length=limit)
        for s in stories:
            s["_id"] = str(s["_id"])
        return {"success": True, "stories": stories, "count": len(stories)}
    except Exception as e:
        logger.error(f"Get stories error: {str(e)}")
        return {"success": True, "stories": [], "count": 0}

@admin_router.post("/api/driver/stories/{story_id}/like")
async def like_driver_story(story_id: str):
    """Like a driver story"""
    try:
        from bson import ObjectId
        await db.driver_stories.update_one(
            {"_id": ObjectId(story_id)},
            {"$inc": {"likes": 1}}
        )
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ==================== FLEET TRACKER ENDPOINTS ====================

@admin_router.get("/api/driver/fleet/nearby")
async def get_nearby_fleet(lat: float = 6.5244, lng: float = 3.3792, radius_km: float = 5):
    """Get nearby fleet drivers for tracking"""
    try:
        # Get online drivers from the database
        online_drivers = await db.driver_locations.find({
            "is_online": True,
            "updated_at": {"$gte": (datetime.utcnow() - timedelta(minutes=10)).isoformat()}
        }).to_list(length=50)
        
        fleet = []
        for d in online_drivers:
            d["_id"] = str(d["_id"])
            fleet.append(d)
        
        # If no real drivers, return simulated fleet for demo
        if len(fleet) == 0:
            import random
            fleet = [
                {"driver_id": f"fleet_{i}", "name": name, "vehicle": veh, "lat": lat + random.uniform(-0.02, 0.02), "lng": lng + random.uniform(-0.02, 0.02), "status": status, "trips_today": random.randint(0, 12)}
                for i, (name, veh, status) in enumerate([
                    ("Emeka O.", "Toyota Camry (Silver)", "on_trip"),
                    ("Abdul K.", "Honda Accord (Black)", "available"),
                    ("Chidi N.", "Toyota Corolla (White)", "on_trip"),
                    ("Musa A.", "Hyundai Elantra (Blue)", "available"),
                    ("Tunde B.", "Kia Rio (Red)", "on_trip"),
                    ("Ibrahim Y.", "Nissan Altima (Grey)", "available"),
                ])
            ]
        
        return {"success": True, "fleet": fleet, "count": len(fleet)}
    except Exception as e:
        logger.error(f"Fleet tracker error: {str(e)}")
        return {"success": True, "fleet": [], "count": 0}


