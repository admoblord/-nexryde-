"""
NexRyde Driver Report & Safety System
Allows riders to report abusive/offensive drivers
Implements automatic suspension based on report count
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from enum import Enum
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
import logging

logger = logging.getLogger(__name__)

class ReportCategory(str, Enum):
    RUDE_BEHAVIOR = "rude_behavior"
    UNSAFE_DRIVING = "unsafe_driving"
    OVERCHARGING = "overcharging"
    FAKE_TRIP = "fake_trip"
    APP_MISUSE = "app_misuse"
    ABUSIVE_BEHAVIOR = "abusive_behavior"
    OFFENSIVE_LANGUAGE = "offensive_language"
    RECKLESS_DRIVING = "reckless_driving"
    HARASSMENT = "harassment"
    INAPPROPRIATE_CONDUCT = "inappropriate_conduct"
    ROUTE_MANIPULATION = "route_manipulation"
    SAFETY_CONCERN = "safety_concern"
    OTHER = "other"

class ReportSeverity(str, Enum):
    LOW = "low"           # 1 point
    MEDIUM = "medium"     # 3 points
    HIGH = "high"         # 5 points
    CRITICAL = "critical" # 10 points (immediate suspension)

class ReportStatus(str, Enum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"

# Configuration
REPORT_THRESHOLDS = {
    "warning": 3,           # Send warning at 3 points
    "temporary_suspension": 10,  # Suspend for 7 days at 10 points
    "permanent_suspension": 20   # Permanent ban at 20 points
}

CATEGORY_SEVERITY_MAP = {
    ReportCategory.ABUSIVE_BEHAVIOR: ReportSeverity.HIGH,
    ReportCategory.OFFENSIVE_LANGUAGE: ReportSeverity.MEDIUM,
    ReportCategory.RECKLESS_DRIVING: ReportSeverity.CRITICAL,
    ReportCategory.HARASSMENT: ReportSeverity.CRITICAL,
    ReportCategory.INAPPROPRIATE_CONDUCT: ReportSeverity.HIGH,
    ReportCategory.ROUTE_MANIPULATION: ReportSeverity.LOW,
    ReportCategory.SAFETY_CONCERN: ReportSeverity.HIGH,
    ReportCategory.OTHER: ReportSeverity.LOW
}

SEVERITY_POINTS = {
    ReportSeverity.LOW: 1,
    ReportSeverity.MEDIUM: 3,
    ReportSeverity.HIGH: 5,
    ReportSeverity.CRITICAL: 10
}


class DriverReportSystem:
    """Manages driver reports and safety enforcement"""
    
    def __init__(self, db):
        self.db = db
    
    async def submit_report(
        self,
        rider_id: str,
        driver_id: str,
        trip_id: str,
        category: ReportCategory,
        description: str,
        evidence_urls: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Submit a report against a driver
        """
        # Validate trip exists and rider was actually on that trip
        trip = await self.db.trips.find_one({
            "id": trip_id,
            "rider_id": rider_id,
            "driver_id": driver_id
        })
        
        if not trip:
            return {
                "success": False,
                "message": "Invalid trip or you were not a rider on this trip"
            }
        
        # Check if rider already reported this driver for this trip
        existing_report = await self.db.driver_reports.find_one({
            "rider_id": rider_id,
            "driver_id": driver_id,
            "trip_id": trip_id
        })
        
        if existing_report:
            return {
                "success": False,
                "message": "You have already reported this driver for this trip"
            }
        
        # Determine severity based on category
        severity = CATEGORY_SEVERITY_MAP.get(category, ReportSeverity.MEDIUM)
        points = SEVERITY_POINTS[severity]
        
        # Create report
        report = {
            "report_id": f"RPT-{datetime.utcnow().timestamp()}",
            "rider_id": rider_id,
            "driver_id": driver_id,
            "trip_id": trip_id,
            "category": category,
            "severity": severity,
            "points": points,
            "description": description,
            "evidence_urls": evidence_urls or [],
            "status": ReportStatus.PENDING,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "reviewed_by": None,
            "resolution_notes": None
        }
        
        await self.db.driver_reports.insert_one(report)
        
        # Update driver's report score
        await self.update_driver_report_score(driver_id)
        
        # Check if automatic action is needed
        action_taken = await self.check_and_apply_automatic_actions(driver_id)
        
        # Send notification to driver
        await self.notify_driver_of_report(driver_id, category, severity)
        
        # Notify admin for high-severity reports
        if severity in [ReportSeverity.HIGH, ReportSeverity.CRITICAL]:
            await self.notify_admin_of_critical_report(report)
        
        logger.info(f"Report submitted: {category} against driver {driver_id} by rider {rider_id}")
        
        return {
            "success": True,
            "message": "Report submitted successfully. Our team will review it.",
            "report_id": report["report_id"],
            "severity": severity,
            "action_taken": action_taken
        }
    
    async def update_driver_report_score(self, driver_id: str):
        """Calculate and update driver's total report score"""
        # Get all unresolved reports in last 90 days
        reports = await self.db.driver_reports.find({
            "driver_id": driver_id,
            "status": {"$in": [ReportStatus.PENDING, ReportStatus.UNDER_REVIEW]},
            "created_at": {"$gte": datetime.utcnow() - timedelta(days=90)}
        }).to_list(1000)
        
        total_points = sum(r.get("points", 0) for r in reports)
        
        # Update driver safety score
        await self.db.users.update_one(
            {"id": driver_id, "role": "driver"},
            {
                "$set": {
                    "safety_score": {
                        "report_points": total_points,
                        "total_reports": len(reports),
                        "last_updated": datetime.utcnow()
                    }
                }
            }
        )
        
        return total_points
    
    async def check_and_apply_automatic_actions(self, driver_id: str) -> Optional[str]:
        """
        Check if driver has reached threshold for automatic action
        Returns action taken (if any)
        """
        # Get current report score
        driver = await self.db.users.find_one({"id": driver_id, "role": "driver"})
        
        if not driver:
            return None
        
        report_points = driver.get("safety_score", {}).get("report_points", 0)
        
        action_taken = None
        
        # Critical threshold - Permanent suspension
        if report_points >= REPORT_THRESHOLDS["permanent_suspension"]:
            await self.suspend_driver(
                driver_id,
                reason="Exceeded critical report threshold (20+ points)",
                duration_days=None,  # Permanent
                suspended_by="system"
            )
            action_taken = "permanent_suspension"
        
        # High threshold - Temporary suspension (7 days)
        elif report_points >= REPORT_THRESHOLDS["temporary_suspension"]:
            await self.suspend_driver(
                driver_id,
                reason="Exceeded high report threshold (10+ points)",
                duration_days=7,
                suspended_by="system"
            )
            action_taken = "temporary_suspension_7d"
        
        # Warning threshold
        elif report_points >= REPORT_THRESHOLDS["warning"]:
            await self.send_warning_to_driver(driver_id, report_points)
            action_taken = "warning_sent"
        
        if action_taken:
            logger.warning(f"Automatic action taken for driver {driver_id}: {action_taken}")
        
        return action_taken
    
    async def suspend_driver(
        self,
        driver_id: str,
        reason: str,
        duration_days: Optional[int],
        suspended_by: str
    ):
        """Suspend driver account"""
        suspension_end = None
        if duration_days:
            suspension_end = datetime.utcnow() + timedelta(days=duration_days)
        
        await self.db.driver_suspensions.insert_one({
            "driver_id": driver_id,
            "reason": reason,
            "suspended_at": datetime.utcnow(),
            "suspended_by": suspended_by,
            "suspension_end": suspension_end,
            "is_permanent": duration_days is None,
            "status": "active"
        })
        
        # Update driver status
        await self.db.users.update_one(
            {"id": driver_id},
            {
                "$set": {
                    "account_status": "suspended",
                    "suspension_reason": reason,
                    "suspended_until": suspension_end
                }
            }
        )
        
        # Send notification
        await self.notify_driver_of_suspension(driver_id, reason, suspension_end)
        
        suspension_type = "permanent" if not duration_days else f"{duration_days} days"
        logger.critical(f"Driver {driver_id} suspended ({suspension_type}): {reason}")
    
    async def send_warning_to_driver(self, driver_id: str, current_points: int):
        """Send warning notification to driver"""
        driver = await self.db.users.find_one({"id": driver_id})
        
        if not driver:
            return
        
        message = f"⚠️ SAFETY WARNING: You have {current_points} safety report points. " \
                  f"At 10 points, your account will be temporarily suspended. " \
                  f"Please maintain professional behavior with all riders."
        
        await self.db.notifications.insert_one({
            "user_id": driver_id,
            "type": "safety_warning",
            "title": "Safety Warning",
            "message": message,
            "created_at": datetime.utcnow(),
            "read": False,
            "priority": "high"
        })
    
    async def notify_driver_of_report(self, driver_id: str, category: str, severity: str):
        """Notify driver that they've been reported"""
        message = f"A rider has reported an issue during their trip. " \
                  f"Category: {category.replace('_', ' ').title()}. " \
                  f"Our team will review this report. Please ensure you maintain professional conduct."
        
        await self.db.notifications.insert_one({
            "user_id": driver_id,
            "type": "report_notification",
            "title": "Rider Report",
            "message": message,
            "created_at": datetime.utcnow(),
            "read": False,
            "priority": "medium"
        })
    
    async def notify_driver_of_suspension(
        self,
        driver_id: str,
        reason: str,
        suspension_end: Optional[datetime]
    ):
        """Notify driver of account suspension"""
        if suspension_end:
            message = f"Your account has been suspended until {suspension_end.strftime('%B %d, %Y')}. " \
                      f"Reason: {reason}. Contact support if you believe this is an error."
        else:
            message = f"Your account has been permanently suspended. Reason: {reason}. " \
                      f"Contact support for more information."
        
        await self.db.notifications.insert_one({
            "user_id": driver_id,
            "type": "suspension",
            "title": "Account Suspended",
            "message": message,
            "created_at": datetime.utcnow(),
            "read": False,
            "priority": "critical"
        })
    
    async def notify_admin_of_critical_report(self, report: Dict[str, Any]):
        """Notify admin of critical safety report"""
        await self.db.admin_alerts.insert_one({
            "type": "critical_driver_report",
            "report_id": report["report_id"],
            "driver_id": report["driver_id"],
            "category": report["category"],
            "severity": report["severity"],
            "created_at": datetime.utcnow(),
            "requires_immediate_review": True
        })
    
    async def get_driver_reports(
        self,
        driver_id: str,
        include_resolved: bool = False
    ) -> List[Dict[str, Any]]:
        """Get all reports for a driver"""
        query = {"driver_id": driver_id}
        
        if not include_resolved:
            query["status"] = {"$ne": ReportStatus.RESOLVED}
        
        reports = await self.db.driver_reports.find(query).sort("created_at", -1).to_list(100)
        
        for report in reports:
            report.pop("_id", None)
        
        return reports
    
    async def get_report_statistics(self, driver_id: str) -> Dict[str, Any]:
        """Get statistics on driver reports"""
        reports = await self.get_driver_reports(driver_id, include_resolved=True)
        
        total_reports = len(reports)
        pending_reports = len([r for r in reports if r["status"] == ReportStatus.PENDING])
        resolved_reports = len([r for r in reports if r["status"] == ReportStatus.RESOLVED])
        
        # Get category breakdown
        category_counts = {}
        for report in reports:
            category = report["category"]
            category_counts[category] = category_counts.get(category, 0) + 1
        
        # Get current safety score
        driver = await self.db.users.find_one({"id": driver_id})
        safety_score = driver.get("safety_score", {}) if driver else {}
        
        return {
            "total_reports": total_reports,
            "pending_reports": pending_reports,
            "resolved_reports": resolved_reports,
            "current_report_points": safety_score.get("report_points", 0),
            "category_breakdown": category_counts,
            "thresholds": REPORT_THRESHOLDS
        }
