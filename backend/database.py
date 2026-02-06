"""Shared database connection and utilities for NEXRYDE backend."""
import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'nexryde_db')]

# Shared logger
logger = logging.getLogger('server')

# Shared config keys
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '')

# Shared business config
SUBSCRIPTION_CONFIG = {
    "monthly_fee": 25000,
    "trial_days": 7,
    "currency": "NGN",
    "bank_details": {
        "bank_name": "UBA",
        "account_name": "ADMOBLORDGROUP LIMITED",
        "account_number": "1028400669",
    }
}
