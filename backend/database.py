"""Shared database connection and utilities for NEXRYDE backend."""
import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGODB_URI') or os.environ.get('MONGO_URL')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'nexryde_db')]

# Shared logger
logger = logging.getLogger('server')

# Shared config keys
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '')

# Shared business config
SUBSCRIPTION_CONFIG = {
    "monthly_fee": 18000,
    "trial_hours": 48,
    "trial_trips": 3,
    "currency": "NGN",
    "bank_details": {
        "provider": "SquadCo",
        "mode": "virtual_account_only",
        "message": "Virtual account is generated per driver. No manual company transfer account.",
    }
}
