"""Admin Router - All admin panel and management endpoints for NEXRYDE."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from datetime import datetime, timezone, timedelta
import hashlib
import logging

from database import db, SUBSCRIPTION_CONFIG

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

