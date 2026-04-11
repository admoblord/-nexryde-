"""Chat Router - AI Chat, Driver-Rider Messaging, WebSocket, masked in-trip calling."""
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Request
from pydantic import BaseModel, Field
from typing import Optional, Dict, Set
from datetime import datetime, timezone, timedelta
import logging
import os
import uuid
import asyncio

from database import db
from auth_guard import require_authenticated, verify_trip_participant, verify_owner_strict
from security_advanced import verify_jwt_token

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    LlmChat = None
    UserMessage = None

logger = logging.getLogger('server')
chat_router = APIRouter(prefix="/api", tags=["Chat"])

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
VOICE_PROVIDER = os.environ.get('VOICE_PROVIDER', '').strip().lower()
VOICE_API_KEY = os.environ.get('VOICE_API_KEY', '')
VOICE_API_SECRET = os.environ.get('VOICE_API_SECRET', '')
VOICE_RELAY_NUMBER = os.environ.get('VOICE_RELAY_NUMBER', '')
CALL_SESSION_EXPIRY_MINUTES = int(os.environ.get('CALL_SESSION_EXPIRY_MINUTES', '30'))
CALL_COOLDOWN_SECONDS = 30

# ==================== MODELS ====================

class AIChatRequest(BaseModel):
    user_id: str
    message: str
    user_role: str = "rider"
    session_id: Optional[str] = None

class ChatMessageRequest(BaseModel):
    trip_id: str
    message: str
    message_type: str = "text"

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    sender_id: str
    sender_role: str
    message: str
    message_type: str = "text"
    is_read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CallSessionRequest(BaseModel):
    tripId: str
    role: str  # rider | driver
    userId: Optional[str] = None  # compatibility fallback when auth header is unavailable

# ==================== CONSTANTS ====================

AI_CHAT_SYSTEM_PROMPT = """You are NEXRYDE AI, a smart and friendly assistant for Nigeria's premier ride-hailing platform.

About NEXRYDE:
- Driver-first platform: Drivers pay from ₦15,000 (launch) then ₦18,000/month, keep 100% of earnings
- No per-trip commission - drivers keep what they earn
- Safety features: SOS button, trip sharing, verified drivers, route monitoring
- Cash and bank transfer payments (peer-to-peer)

Your personality:
- Friendly, helpful, and concise
- Use Nigerian context and expressions naturally
- Be empathetic and solution-oriented
- Keep responses under 150 words

You can help with:
- Fare estimates and pricing questions
- Safety features and emergency help
- Account and payment questions  
- Trip information and status
- Driver/rider ratings and feedback
- General platform questions

Always be helpful and if you don't know something specific, guide users to contact support."""

PRESET_MESSAGES = {
    "driver": [
        "I'm on my way",
        "I've arrived at pickup",
        "Please come to the car",
        "I'm waiting for you",
        "Traffic is heavy",
        "I'll be there in 5 minutes"
    ],
    "rider": [
        "I'm coming out now",
        "Please wait a moment",
        "I'm at the entrance",
        "Can you call me?",
        "Running a bit late",
        "I see you!"
    ]
}

# ==================== WEBSOCKET CONNECTION MANAGER ====================

class ConnectionManager:
    """Manages WebSocket connections for real-time chat"""
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.user_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, trip_id: str, user_id: str):
        await websocket.accept()
        if trip_id not in self.active_connections:
            self.active_connections[trip_id] = set()
        self.active_connections[trip_id].add(websocket)
        self.user_connections[user_id] = websocket
        logger.info(f"WebSocket connected: user={user_id}, trip={trip_id}")

    def disconnect(self, websocket: WebSocket, trip_id: str, user_id: str):
        if trip_id in self.active_connections:
            self.active_connections[trip_id].discard(websocket)
            if not self.active_connections[trip_id]:
                del self.active_connections[trip_id]
        if user_id in self.user_connections:
            del self.user_connections[user_id]
        logger.info(f"WebSocket disconnected: user={user_id}, trip={trip_id}")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending message: {e}")

    async def broadcast_to_trip(self, message: dict, trip_id: str, exclude_user: str = None):
        if trip_id not in self.active_connections:
            return
        for connection in self.active_connections[trip_id]:
            try:
                user_id = None
                for uid, ws in self.user_connections.items():
                    if ws == connection:
                        user_id = uid
                        break
                if exclude_user and user_id == exclude_user:
                    continue
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting: {e}")

chat_manager = ConnectionManager()

# ==================== AI CHAT ====================

@chat_router.post("/chat/ai")
async def ai_chat(request: AIChatRequest, http_request: Request):
    verify_owner_strict(http_request, request.user_id)
    session_id = request.session_id or f"ai-{request.user_id}"
    user_text = request.message.strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="message is required")

    history_collection = db.ai_chat_messages
    now = datetime.now(timezone.utc)
    await history_collection.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": request.user_id,
        "role": "user",
        "message": user_text,
        "session_id": session_id,
        "timestamp": now,
    })

    reply = "I’m here to help. Please share more details and I’ll guide you."
    if LlmChat and EMERGENT_LLM_KEY:
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=session_id,
                system_message=AI_CHAT_SYSTEM_PROMPT,
            ).with_model("openai", "gpt-4o")
            llm_response = await chat.send_message(UserMessage(text=user_text))
            if llm_response:
                reply = str(llm_response).strip()
        except Exception as e:
            logger.warning(f"AI chat fallback used: {e}")

    await history_collection.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": request.user_id,
        "role": "assistant",
        "message": reply,
        "session_id": session_id,
        "timestamp": datetime.now(timezone.utc),
    })

    return {"success": True, "message": reply, "session_id": session_id}


@chat_router.get("/chat/ai/history/{user_id}")
async def get_ai_chat_history(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    messages = await db.ai_chat_messages.find(
        {"user_id": user_id},
        {"_id": 0},
    ).sort("timestamp", 1).limit(100).to_list(100)

    session_id = messages[-1]["session_id"] if messages else f"ai-{user_id}"
    return {
        "session_id": session_id,
        "messages": [
            {
                "id": msg["id"],
                "role": "user" if msg.get("role") == "user" else "assistant",
                "message": msg.get("message", ""),
                "timestamp": msg["timestamp"].isoformat() if hasattr(msg.get("timestamp"), "isoformat") else str(msg.get("timestamp")),
            }
            for msg in messages
        ],
    }

# ==================== DRIVER-RIDER MESSAGING ====================

@chat_router.post("/chat/message")
async def send_chat_message(request: ChatMessageRequest, http_request: Request):
    """Send a message between driver and rider"""
    try:
        auth_user_id = require_authenticated(http_request)
        trip = await db.trips.find_one({"id": request.trip_id})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        if auth_user_id not in [trip.get("rider_id"), trip.get("driver_id")]:
            raise HTTPException(status_code=403, detail="Not authorized")
        sender_role = "driver" if auth_user_id == trip.get("driver_id") else "rider"

        message = {
            "id": str(uuid.uuid4()),
            "trip_id": request.trip_id,
            "sender_id": auth_user_id,
            "sender_role": sender_role,
            "message": request.message,
            "message_type": request.message_type,
            "is_read": False,
            "created_at": datetime.now(timezone.utc)
        }

        await db.trip_messages.insert_one(message)

        await db.trips.update_one(
            {"id": request.trip_id},
            {"$set": {"last_message_at": datetime.now(timezone.utc)}}
        )

        return {
            "success": True,
            "message_id": message["id"],
            "timestamp": message["created_at"].isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Send message error: {e}")
        raise HTTPException(status_code=500, detail="Failed to send message")

@chat_router.get("/chat/messages/{trip_id}")
async def get_chat_trip_messages(trip_id: str, user_id: str, request: Request, limit: int = 50, since: Optional[str] = None):
    """Get messages for a trip"""
    try:
        verify_owner_strict(request, user_id)
        trip = await db.trips.find_one({"id": trip_id})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        verify_trip_participant(request, trip)

        query = {"trip_id": trip_id}
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
                query["created_at"] = {"$gt": since_dt}
            except Exception:
                pass

        messages = await db.trip_messages.find(query).sort("created_at", 1).limit(limit).to_list(limit)

        other_role = "driver" if trip["rider_id"] == user_id else "rider"
        await db.trip_messages.update_many(
            {"trip_id": trip_id, "sender_role": other_role, "is_read": False},
            {"$set": {"is_read": True}}
        )

        return {
            "messages": [
                {
                    "id": msg["id"],
                    "sender_id": msg["sender_id"],
                    "sender_role": msg["sender_role"],
                    "message": msg["message"],
                    "message_type": msg["message_type"],
                    "is_read": msg["is_read"],
                    "timestamp": msg["created_at"].isoformat()
                }
                for msg in messages
            ],
            "trip_id": trip_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get messages error: {e}")
        return {"messages": [], "trip_id": trip_id, "error": str(e)}

@chat_router.get("/chat/unread-count/{user_id}")
async def get_unread_count(user_id: str, request: Request):
    """Get unread message count for a user"""
    try:
        verify_owner_strict(request, user_id)
        active_trips = await db.trips.find({
            "$or": [
                {"rider_id": user_id},
                {"driver_id": user_id}
            ],
            "status": {"$in": ["accepted", "ongoing"]}
        }).to_list(100)

        total_unread = 0
        for trip in active_trips:
            is_rider = trip["rider_id"] == user_id
            other_role = "driver" if is_rider else "rider"
            count = await db.trip_messages.count_documents({
                "trip_id": trip["id"],
                "sender_role": other_role,
                "is_read": False
            })
            total_unread += count

        return {"unread_count": total_unread}

    except Exception as e:
        logger.error(f"Get unread count error: {e}")
        return {"unread_count": 0, "error": str(e)}

@chat_router.get("/chat/presets/{role}")
async def get_preset_messages(role: str):
    """Get preset quick reply messages"""
    if role not in PRESET_MESSAGES:
        return {"presets": PRESET_MESSAGES["rider"]}
    return {"presets": PRESET_MESSAGES[role]}

# ==================== IN-TRIP CALL ====================

def _trip_allows_call(status: str) -> bool:
    normalized = (status or "").strip().lower()
    return normalized in {"driver_assigned", "arriving", "arrived", "accepted", "pickup", "ongoing", "active"}


def _resolve_relay_number() -> str:
    """
    Returns relay DID configured by provider.
    Real bridging is provider-managed outside this API session creation step.
    """
    if not VOICE_PROVIDER:
        raise HTTPException(status_code=503, detail="VOICE_PROVIDER not configured")
    if not VOICE_API_KEY or not VOICE_API_SECRET:
        raise HTTPException(status_code=503, detail="Voice provider credentials are missing")
    if not VOICE_RELAY_NUMBER:
        raise HTTPException(status_code=503, detail="VOICE_RELAY_NUMBER not configured")
    return VOICE_RELAY_NUMBER


async def _create_call_session(trip_id: str, requester_id: str, requester_role: str) -> dict:
    now = datetime.now(timezone.utc)

    if requester_role not in {"rider", "driver"}:
        raise HTTPException(status_code=400, detail="role must be rider or driver")

    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if not _trip_allows_call(str(trip.get("status", ""))):
        raise HTTPException(status_code=403, detail="Calling allowed only for assigned/active trips")

    rider_id = trip.get("rider_id")
    driver_id = trip.get("driver_id")
    if not rider_id or not driver_id:
        raise HTTPException(status_code=403, detail="Driver must be assigned before calling")

    if requester_role == "rider" and requester_id != rider_id:
        raise HTTPException(status_code=403, detail="Not authorized for this trip")
    if requester_role == "driver" and requester_id != driver_id:
        raise HTTPException(status_code=403, detail="Not authorized for this trip")

    # Cooldown per caller role.
    latest_for_role = await db.call_sessions.find_one(
        {"trip_id": trip_id, "caller_role": requester_role},
        sort=[("created_at", -1)],
    )
    if latest_for_role and latest_for_role.get("created_at"):
        try:
            elapsed = (now - latest_for_role["created_at"]).total_seconds()
        except Exception:
            elapsed = CALL_COOLDOWN_SECONDS
        if elapsed < CALL_COOLDOWN_SECONDS:
            wait = int(CALL_COOLDOWN_SECONDS - elapsed)
            raise HTTPException(status_code=429, detail=f"Please wait {wait}s before next call")

    # One active session per trip.
    active_session = await db.call_sessions.find_one({
        "trip_id": trip_id,
        "status": "active",
        "expires_at": {"$gt": now},
    })

    relay_number = _resolve_relay_number()
    if active_session:
        await db.call_sessions.update_one(
            {"id": active_session["id"]},
            {"$set": {"caller_role": requester_role}}
        )
        return {"dialNumber": active_session["relay_number"], "sessionId": active_session["id"]}

    expires_at = now + timedelta(minutes=CALL_SESSION_EXPIRY_MINUTES)
    session_doc = {
        "id": str(uuid.uuid4()),
        "trip_id": trip_id,
        "rider_id": rider_id,
        "driver_id": driver_id,
        "relay_number": relay_number,
        "caller_role": requester_role,
        "status": "active",
        "expires_at": expires_at,
        "created_at": now,
    }
    await db.call_sessions.insert_one(session_doc)
    return {"dialNumber": relay_number, "sessionId": session_doc["id"]}


@chat_router.post("/call/session")
async def create_masked_call_session(request: CallSessionRequest, http_request: Request):
    """
    Create/return a GSM relay dial number for rider-driver masked calling.
    """
    requester_id = require_authenticated(http_request)

    result = await _create_call_session(
        trip_id=request.tripId,
        requester_id=requester_id,
        requester_role=request.role.strip().lower(),
    )
    return {"dialNumber": result["dialNumber"]}


@chat_router.post("/trip/{trip_id}/call")
async def initiate_trip_call(trip_id: str, request: dict, http_request: Request):
    """
    Backward-compatible endpoint used by existing clients.
    Uses masked relay and never returns real party phone numbers.
    """
    caller_id = require_authenticated(http_request)
    caller_role = (request.get("caller_role") or "rider").strip().lower()

    result = await _create_call_session(
        trip_id=trip_id,
        requester_id=caller_id,
        requester_role=caller_role,
    )
    # Keep legacy shape expected by old frontend while still masked-only.
    return {
        "success": True,
        "dialNumber": result["dialNumber"],
        "phone_number": result["dialNumber"],
        "call_type": "gsm_masked_relay",
        "privacy_note": "Real numbers are hidden by relay",
    }


async def cleanup_expired_call_sessions_once() -> int:
    """Expire old call sessions and sessions tied to completed/cancelled trips."""
    now = datetime.now(timezone.utc)
    changed = 0
    result = await db.call_sessions.update_many(
        {"status": "active", "expires_at": {"$lte": now}},
        {"$set": {"status": "expired"}},
    )
    changed += int(result.modified_count or 0)

    ended_trip_ids = await db.trips.find(
        {"status": {"$in": ["completed", "cancelled"]}},
        {"_id": 0, "id": 1}
    ).to_list(2000)
    trip_ids = [t.get("id") for t in ended_trip_ids if t.get("id")]
    if trip_ids:
        result2 = await db.call_sessions.update_many(
            {"status": "active", "trip_id": {"$in": trip_ids}},
            {"$set": {"status": "expired", "expires_at": now}},
        )
        changed += int(result2.modified_count or 0)
    return changed


_call_cleanup_started = False


def start_call_session_cleanup_task() -> None:
    global _call_cleanup_started
    if _call_cleanup_started:
        return
    _call_cleanup_started = True

    async def _job():
        while True:
            try:
                await cleanup_expired_call_sessions_once()
            except Exception as e:
                logger.error(f"Call session cleanup failed: {e}")
            await asyncio.sleep(300)  # every 5 minutes

    asyncio.create_task(_job())

# ==================== WEBSOCKET CHAT ====================

@chat_router.websocket("/ws/chat/{trip_id}/{user_id}")
async def websocket_chat(websocket: WebSocket, trip_id: str, user_id: str):
    """WebSocket endpoint for real-time driver-rider chat"""
    auth_user_id = None
    try:
        token = (websocket.query_params.get("token") or "").strip()
        if not token:
            await websocket.close(code=1008, reason="Missing auth token")
            return

        payload = verify_jwt_token(token)
        auth_user_id = str(payload.get("sub") or "").strip()
        if not auth_user_id:
            await websocket.close(code=1008, reason="Invalid auth token")
            return
        if auth_user_id != user_id:
            await websocket.close(code=1008, reason="User identity mismatch")
            return

        trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "rider_id": 1, "driver_id": 1})
        if not trip:
            await websocket.close(code=1008, reason="Trip not found")
            return
        if auth_user_id not in {trip.get("rider_id"), trip.get("driver_id")}:
            await websocket.close(code=1008, reason="Not a trip participant")
            return
    except HTTPException as e:
        await websocket.close(code=1008, reason=e.detail if isinstance(e.detail, str) else "Unauthorized")
        return
    except Exception:
        await websocket.close(code=1008, reason="Unauthorized")
        return

    await chat_manager.connect(websocket, trip_id, auth_user_id)

    try:
        trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "rider_id": 1, "driver_id": 1})
        sender_role = "rider" if trip and auth_user_id == trip.get("rider_id") else "driver"

        await websocket.send_json({
            "type": "connected",
            "trip_id": trip_id,
            "user_id": auth_user_id,
            "message": "Connected to chat"
        })

        messages = await db.trip_messages.find(
            {"trip_id": trip_id},
            {"_id": 0}
        ).sort("timestamp", 1).to_list(100)

        if messages:
            serialized = []
            for msg in messages:
                m = dict(msg)
                if "created_at" in m and hasattr(m["created_at"], "isoformat"):
                    m["timestamp"] = m.pop("created_at").isoformat()
                serialized.append(m)
            await websocket.send_json({
                "type": "history",
                "messages": serialized
            })

        while True:
            data = await websocket.receive_json()

            if data.get("type") == "message":
                user = await db.users.find_one({"id": auth_user_id}, {"name": 1, "_id": 0})
                text = str(data.get("message", "")).strip()
                if not text:
                    continue

                message_doc = {
                    "id": str(uuid.uuid4()),
                    "trip_id": trip_id,
                    "sender_id": auth_user_id,
                    "sender_name": user.get("name", "User") if user else "User",
                    "sender_role": sender_role,
                    "message": text,
                    "message_type": data.get("message_type", "text"),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "is_read": False
                }

                await db.trip_messages.insert_one(message_doc)

                await chat_manager.broadcast_to_trip({
                    "type": "new_message",
                    **{k: v for k, v in message_doc.items() if k != "_id"}
                }, trip_id)

            elif data.get("type") == "typing":
                await chat_manager.broadcast_to_trip({
                    "type": "typing",
                    "user_id": auth_user_id,
                    "is_typing": data.get("is_typing", False)
                }, trip_id, exclude_user=auth_user_id)

            elif data.get("type") == "read":
                await db.trip_messages.update_many(
                    {"trip_id": trip_id, "sender_id": {"$ne": auth_user_id}},
                    {"$set": {"is_read": True}}
                )
                await chat_manager.broadcast_to_trip({
                    "type": "messages_read",
                    "user_id": auth_user_id
                }, trip_id, exclude_user=auth_user_id)

    except WebSocketDisconnect:
        if auth_user_id:
            chat_manager.disconnect(websocket, trip_id, auth_user_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if auth_user_id:
            chat_manager.disconnect(websocket, trip_id, auth_user_id)
