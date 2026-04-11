"""One-time script to clean test data from MongoDB."""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('.env')
mongo_url = os.environ.get('MONGODB_URI') or os.environ.get('MONGO_URL')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'nexryde_db')]


async def cleanup():
    r1 = await db.trips.delete_many({"$or": [
        {"pickup_location.address": {"$regex": "Test", "$options": "i"}},
        {"dropoff_location.address": {"$regex": "Test", "$options": "i"}},
        {"rider_id": {"$regex": "^TEST_"}},
        {"rider_id": {"$regex": "^fav_rider_"}},
        {"driver_id": {"$regex": "^TEST_"}},
        {"driver_id": {"$regex": "^fav_driver_"}},
    ]})
    print(f"Deleted {r1.deleted_count} test trips")

    r2 = await db.users.delete_many({"$or": [
        {"id": {"$regex": "^TEST_"}},
        {"id": {"$regex": "^fav_"}},
        {"name": {"$regex": "^TestRider_"}},
        {"name": {"$regex": "^TestDriver_"}},
        {"name": {"$regex": "^FavRider_"}},
        {"name": {"$regex": "^FavDriver_"}},
    ]})
    print(f"Deleted {r2.deleted_count} test users")

    r3 = await db.driver_profiles.delete_many({"$or": [
        {"user_id": {"$regex": "^TEST_"}},
        {"user_id": {"$regex": "^fav_"}},
    ]})
    print(f"Deleted {r3.deleted_count} test driver profiles")

    r4 = await db.subscriptions.delete_many({"$or": [
        {"driver_id": {"$regex": "^TEST_"}},
        {"driver_id": {"$regex": "^fav_"}},
    ]})
    print(f"Deleted {r4.deleted_count} test subscriptions")

    r5 = await db.wallets.delete_many({"$or": [
        {"user_id": {"$regex": "^TEST_"}},
        {"user_id": {"$regex": "^fav_"}},
    ]})
    print(f"Deleted {r5.deleted_count} test wallets")

    pending = await db.trips.count_documents({"status": {"$in": ["pending", "pending_driver_offers"]}})
    print(f"\nRemaining pending trips: {pending}")

    if pending > 0:
        cursor = db.trips.find(
            {"status": {"$in": ["pending", "pending_driver_offers"]}},
            {"_id": 0, "id": 1, "pickup_location": 1, "rider_id": 1, "status": 1}
        ).limit(10)
        print("Sample pending trips:")
        async for t in cursor:
            pickup = t.get("pickup_location", {})
            addr = pickup.get("address", str(pickup)) if isinstance(pickup, dict) else str(pickup)
            print(f"  - {t.get('id', '?')[:20]}  rider={t.get('rider_id', '?')[:20]}  pickup={addr[:50]}")


asyncio.run(cleanup())
