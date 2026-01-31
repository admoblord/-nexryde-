"""
NexRyde Performance Rewards System
Automatically rewards top-performing drivers with free subscription months
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging

logger = logging.getLogger(__name__)

class PerformanceRewardsManager:
    """Manages driver performance rewards"""
    
    def __init__(self, db):
        self.db = db
    
    async def get_top_drivers_monthly(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get top performing drivers for the current month
        Criteria: Total trips, average rating, acceptance rate, cancellation rate
        """
        # Get start and end of current month
        now = datetime.utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Aggregation pipeline to rank drivers
        pipeline = [
            # Get all trips from this month
            {
                "$match": {
                    "created_at": {"$gte": month_start},
                    "status": "completed",
                    "driver_id": {"$exists": True, "$ne": None}
                }
            },
            # Group by driver
            {
                "$group": {
                    "_id": "$driver_id",
                    "total_trips": {"$sum": 1},
                    "total_earnings": {"$sum": "$fare"},
                    "avg_rating": {"$avg": "$driver_rating"}
                }
            },
            # Get driver details
            {
                "$lookup": {
                    "from": "users",
                    "localField": "_id",
                    "foreignField": "id",
                    "as": "driver_info"
                }
            },
            {
                "$unwind": "$driver_info"
            },
            # Calculate score (weighted)
            {
                "$addFields": {
                    "performance_score": {
                        "$add": [
                            {"$multiply": ["$total_trips", 10]},  # 10 points per trip
                            {"$multiply": ["$avg_rating", 20]},   # 20 points per rating point
                            {"$multiply": ["$total_earnings", 0.001]}  # 0.001 points per naira
                        ]
                    }
                }
            },
            # Sort by performance score
            {
                "$sort": {"performance_score": -1}
            },
            # Limit to top performers
            {
                "$limit": limit
            },
            # Project final fields
            {
                "$project": {
                    "driver_id": "$_id",
                    "driver_name": "$driver_info.name",
                    "driver_phone": "$driver_info.phone",
                    "total_trips": 1,
                    "total_earnings": 1,
                    "avg_rating": 1,
                    "performance_score": 1
                }
            }
        ]
        
        top_drivers = await self.db.trips.aggregate(pipeline).to_list(limit)
        return top_drivers
    
    async def grant_free_month(self, driver_id: str, reason: str = "top_performer") -> Dict[str, Any]:
        """
        Grant a driver 1 month of free subscription
        """
        # Get current subscription
        subscription = await self.db.subscriptions.find_one({"driver_id": driver_id})
        
        if not subscription:
            logger.warning(f"No subscription found for driver {driver_id}")
            return {
                "success": False,
                "message": "No subscription found",
                "driver_id": driver_id
            }
        
        # Extend subscription by 30 days
        current_end = subscription.get("end_date")
        
        if current_end:
            # Parse if string
            if isinstance(current_end, str):
                current_end = datetime.fromisoformat(current_end.replace('Z', '+00:00'))
            
            new_end = current_end + timedelta(days=30)
        else:
            # If no end date, start from now
            new_end = datetime.utcnow() + timedelta(days=30)
        
        # Update subscription
        await self.db.subscriptions.update_one(
            {"driver_id": driver_id},
            {
                "$set": {
                    "end_date": new_end,
                    "updated_at": datetime.utcnow()
                },
                "$inc": {
                    "free_months_earned": 1
                }
            }
        )
        
        # Log reward
        await self.db.rewards_log.insert_one({
            "driver_id": driver_id,
            "reward_type": "free_month",
            "reason": reason,
            "granted_at": datetime.utcnow(),
            "expiry_date": new_end,
            "status": "active"
        })
        
        # Send notification
        await self.send_reward_notification(driver_id, reason)
        
        logger.info(f"Granted free month to driver {driver_id} for {reason}")
        
        return {
            "success": True,
            "message": "Free month granted",
            "driver_id": driver_id,
            "new_end_date": new_end.isoformat(),
            "reason": reason
        }
    
    async def send_reward_notification(self, driver_id: str, reason: str):
        """Send notification to driver about reward"""
        driver = await self.db.users.find_one({"id": driver_id})
        
        if not driver:
            return
        
        messages = {
            "top_performer": "🎉 Congratulations! You're a TOP 10 DRIVER this month! You've earned 1 FREE MONTH of subscription as a reward for your excellent performance!",
            "referral": "🎁 Referral Reward! Your referred driver has completed 20 trips. You've earned 1 FREE MONTH of subscription!",
            "milestone": "🏆 Milestone Achievement! You've earned 1 FREE MONTH of subscription for reaching an important milestone!"
        }
        
        message = messages.get(reason, "🎉 Congratulations! You've earned 1 FREE MONTH of subscription!")
        
        # Store in-app notification
        await self.db.notifications.insert_one({
            "user_id": driver_id,
            "type": "reward",
            "title": "Free Month Reward!",
            "message": message,
            "created_at": datetime.utcnow(),
            "read": False,
            "priority": "high"
        })
        
        # TODO: Send SMS notification (optional)
        # await send_sms_notification(driver["phone"], message)
    
    async def process_monthly_rewards(self) -> Dict[str, Any]:
        """
        Main function to process monthly performance rewards
        Should be called by a cron job on the 1st of each month
        """
        logger.info("Starting monthly performance rewards processing...")
        
        # Get top 10 drivers
        top_drivers = await self.get_top_drivers_monthly(limit=10)
        
        if not top_drivers:
            logger.info("No drivers qualified for rewards this month")
            return {
                "success": True,
                "rewards_granted": 0,
                "message": "No drivers qualified"
            }
        
        rewards_granted = 0
        failed_grants = 0
        
        for driver in top_drivers:
            driver_id = driver["driver_id"]
            
            # Check if driver already received reward this month
            month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            existing_reward = await self.db.rewards_log.find_one({
                "driver_id": driver_id,
                "reward_type": "free_month",
                "reason": "top_performer",
                "granted_at": {"$gte": month_start}
            })
            
            if existing_reward:
                logger.info(f"Driver {driver_id} already received reward this month")
                continue
            
            # Grant free month
            result = await self.grant_free_month(driver_id, reason="top_performer")
            
            if result["success"]:
                rewards_granted += 1
                logger.info(f"Granted free month to {driver_id} (Rank #{rewards_granted})")
            else:
                failed_grants += 1
                logger.error(f"Failed to grant reward to {driver_id}")
        
        # Log activity
        await self.db.admin_activity.insert_one({
            "action": "monthly_rewards_processed",
            "rewards_granted": rewards_granted,
            "failed_grants": failed_grants,
            "total_qualified": len(top_drivers),
            "timestamp": datetime.utcnow(),
            "details": "Automatic monthly performance rewards"
        })
        
        logger.info(f"Monthly rewards processing complete: {rewards_granted} rewards granted")
        
        return {
            "success": True,
            "rewards_granted": rewards_granted,
            "failed_grants": failed_grants,
            "total_qualified": len(top_drivers),
            "top_drivers": top_drivers
        }


# Cron job function (can be called by scheduler)
async def run_monthly_rewards_job():
    """
    Entry point for cron job
    Call this function on the 1st of each month
    """
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'nexryde_db')]
    
    manager = PerformanceRewardsManager(db)
    result = await manager.process_monthly_rewards()
    
    logger.info(f"Monthly rewards job completed: {result}")
    return result
