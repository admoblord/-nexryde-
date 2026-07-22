"""Shared database connection and utilities for NEXRYDE backend."""
import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection — single shared client with production-grade pool settings.
mongo_url = os.environ.get('MONGODB_URI') or os.environ.get('MONGO_URL')

# Default 80 aligns with Cloud Run containerConcurrency=80 so no requests block
# waiting for a connection slot.  Override via MONGO_MAX_POOL_SIZE env var.
_max_pool = int(os.environ.get('MONGO_MAX_POOL_SIZE', '80'))
from pymongo import ReadPreference

client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=_max_pool,
    minPoolSize=2,
    maxIdleTimeMS=45000,
    heartbeatFrequencyMS=10000,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    socketTimeoutMS=20000,
    retryWrites=True,
    retryReads=False,
    waitQueueTimeoutMS=5000,
    compressors=["zlib"],
)
db = client[os.environ.get('DB_NAME', 'nexryde_db')]

# Secondary-preferred reads for analytics/reporting queries (admin dashboard,
# stats endpoints).  Reduces load on primary without compromising write consistency.
db_analytics = client.get_database(
    os.environ.get('DB_NAME', 'nexryde_db'),
    read_preference=ReadPreference.SECONDARY_PREFERRED,
)

# Shared logger
logger = logging.getLogger('server')

# Shared config keys
GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '')

# Shared business config — fee/currency only. Trial numbers live in ONE place:
# driver_trial_policy (system_config.driver_trial_defaults → 15 trips / 14 days).
SUBSCRIPTION_CONFIG = {
    "monthly_fee": 18000,
    "currency": "NGN",
    "bank_details": {
        "provider": "SquadCo",
        "mode": "virtual_account_only",
        "message": "Virtual account is generated per driver. No manual company transfer account.",
    }
}
