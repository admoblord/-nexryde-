"""Chat Router - AI Chat, Driver-Rider Messaging, WebSocket, Presets, In-Trip Call for NEXRYDE."""
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from typing import Optional, Dict, Set
from datetime import datetime, timezone
import logging
import os
import uuid

from database import db

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    LlmChat = None
    UserMessage = None

logger = logging.getLogger('server')
chat_router = APIRouter(prefix="/api", tags=["Chat"])

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')

# ==================== MODELS ====================

class AIChatRequest(BaseModel):
    user_id: str
    message: str
    user_role: str = "rider"
    session_id: Optional[str] = None

class ChatMessageRequest(BaseModel):
    trip_id: str
    sender_id: str
    sender_role: str
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

# ==================== CONSTANTS ====================

AI_CHAT_SYSTEM_PROMPT = """You are NEXRYDE AI, a smart and friendly assistant for Nigeria's premier ride-hailing platform.

About NEXRYDE:
- Driver-first platform: Drivers pay ₦25,000/month flat fee, keep 100% of earnings
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
async def ai_chat(request: AIChatRequest):
    """Real-time AI Chat - Powered by GPT-4o"""
    try:
        session_id = request.session_id or f"chat-{request.user_id}-{datetime.now(timezone.utc).strftime('%Y%m%d%H')}"

        user = await db.users.find_one({"id": request.user_id})
        user_context = ""
        if user:
            user_context = f"\nUser: {user.get('name', 'User')}, Role: {request.user_role}"
            current_trip = await db.trips.find_one({
                f"{request.user_role}_id": request.user_id,
                "status": {"$in": ["pending", "accepted", "ongoing"]}
            })
            if current_trip:
                user_context += f"\nActive trip: Status={current_trip['status']}, Fare=₦{current_trip.get('fare', 0):,.0f}"

        chat_msg = {
            "session_id": session_id,
            "user_id": request.user_id,
            "role": "user",
            "message": request.message,
            "created_at": datetime.now(timezone.utc)
        }
        await db.chat_history.insert_one(chat_msg)

        history = await db.chat_history.find(
            {"session_id": session_id}
        ).sort("created_at", -1).limit(10).to_list(10)
        history.reverse()

        conversation_context = ""
        for msg in history[-6:]:
            role = "User" if msg["role"] == "user" else "AI"
            conversation_context += f"\n{role}: {msg['message']}"

        if LlmChat and (EMERGENT_LLM_KEY or OPENAI_API_KEY):
            api_key_to_use = EMERGENT_LLM_KEY if EMERGENT_LLM_KEY else OPENAI_API_KEY

            chat = LlmChat(
                api_key=api_key_to_use,
                session_id=session_id,
                system_message=AI_CHAT_SYSTEM_PROMPT + user_context + f"\n\nRecent conversation:{conversation_context}"
            ).with_model("openai", "gpt-4o-mini")

            user_message = UserMessage(text=request.message)
            response_text = await chat.send_message(user_message)

            ai_msg = {
                "session_id": session_id,
                "user_id": request.user_id,
                "role": "assistant",
                "message": response_text,
                "created_at": datetime.now(timezone.utc)
            }
            await db.chat_history.insert_one(ai_msg)

            return {
                "success": True,
                "message": response_text,
                "session_id": session_id,
                "powered_by": "gpt-4o-mini",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        else:
            fallback = "I'm here to help! You can ask me about fares, safety, payments, or trip status. What would you like to know?"
            return {
                "success": True,
                "message": fallback,
                "session_id": session_id,
                "powered_by": "fallback",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

    except Exception as e:
        logger.error(f"AI Chat error: {str(e)}")
        return {
            "success": False,
            "message": "Sorry, I'm having trouble right now. Please try again in a moment.",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

@chat_router.get("/chat/ai/history/{user_id}")
async def get_ai_chat_history(user_id: str, limit: int = 50):
    """Get AI chat history for a user"""
    try:
        latest = await db.chat_history.find_one(
            {"user_id": user_id},
            sort=[("created_at", -1)]
        )
        if not latest:
            return {"messages": [], "session_id": None}

        session_id = latest.get("session_id")
        messages = await db.chat_history.find(
            {"session_id": session_id}
        ).sort("created_at", 1).limit(limit).to_list(limit)

        return {
            "messages": [
                {
                    "id": str(msg.get("_id")),
                    "role": msg["role"],
                    "message": msg["message"],
                    "timestamp": msg["created_at"].isoformat()
                }
                for msg in messages
            ],
            "session_id": session_id
        }
    except Exception as e:
        logger.error(f"Get chat history error: {e}")
        return {"messages": [], "session_id": None, "error": str(e)}

# ==================== DRIVER-RIDER MESSAGING ====================

@chat_router.post("/chat/message")
async def send_chat_message(request: ChatMessageRequest):
    """Send a message between driver and rider"""
    try:
        trip = await db.trips.find_one({"id": request.trip_id})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")

        if request.sender_role == "rider" and trip["rider_id"] != request.sender_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        if request.sender_role == "driver" and trip.get("driver_id") != request.sender_id:
            raise HTTPException(status_code=403, detail="Not authorized")

        message = {
            "id": str(uuid.uuid4()),
            "trip_id": request.trip_id,
            "sender_id": request.sender_id,
            "sender_role": request.sender_role,
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
async def get_chat_trip_messages(trip_id: str, user_id: str, limit: int = 50, since: Optional[str] = None):
    """Get messages for a trip"""
    try:
        trip = await db.trips.find_one({"id": trip_id})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")

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
async def get_unread_count(user_id: str):
    """Get unread message count for a user"""
    try:
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

@chat_router.post("/trip/{trip_id}/call")
async def initiate_trip_call(trip_id: str, request: dict):
    """Get the other party's phone number for calling during an active trip"""
    try:
        caller_id = request.get("caller_id", "")
        caller_role = request.get("caller_role", "rider")

        trip = await db.trips.find_one({"id": trip_id})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")

        if trip.get("status") not in ["accepted", "pickup", "ongoing", "pending"]:
            raise HTTPException(status_code=403, detail="Calls only allowed during active trips")

        if caller_role == "rider":
            target_id = trip.get("driver_id")
            if not target_id:
                raise HTTPException(status_code=404, detail="No driver assigned yet")
        else:
            target_id = trip.get("rider_id")

        target_user = await db.users.find_one({"id": target_id}, {"_id": 0})
        phone = target_user.get("phone_number") or target_user.get("phone") if target_user else None
        if not phone:
            raise HTTPException(status_code=404, detail="Phone number not available")

        call_count = await db.call_logs.count_documents({"trip_id": trip_id, "caller_id": caller_id})
        if call_count >= 5:
            raise HTTPException(status_code=429, detail="Maximum 5 calls per trip reached")

        call_log = {
            "call_id": str(uuid.uuid4()),
            "trip_id": trip_id,
            "caller_id": caller_id,
            "caller_role": caller_role,
            "target_id": target_id,
            "phone_number": phone,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.call_logs.insert_one(call_log)

        target_name = ""
        if caller_role == "rider":
            driver_profile = await db.driver_profiles.find_one({"user_id": target_id}, {"_id": 0})
            target_name = f"{driver_profile.get('first_name', '')} {driver_profile.get('last_name', '')}".strip() if driver_profile else "Driver"
        else:
            target_name = target_user.get("name", "Rider")

        return {
            "success": True,
            "phone_number": phone,
            "target_name": target_name,
            "calls_remaining": 5 - call_count - 1,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Call initiation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to initiate call")

# ==================== WEBSOCKET CHAT ====================

@chat_router.websocket("/ws/chat/{trip_id}/{user_id}")
async def websocket_chat(websocket: WebSocket, trip_id: str, user_id: str):
    """WebSocket endpoint for real-time driver-rider chat"""
    await chat_manager.connect(websocket, trip_id, user_id)

    try:
        await websocket.send_json({
            "type": "connected",
            "trip_id": trip_id,
            "user_id": user_id,
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
                user = await db.users.find_one({"id": user_id}, {"name": 1, "role": 1, "_id": 0})

                message_doc = {
                    "id": str(uuid.uuid4()),
                    "trip_id": trip_id,
                    "sender_id": user_id,
                    "sender_name": user.get("name", "User") if user else "User",
                    "sender_role": data.get("sender_role", user.get("role", "rider") if user else "rider"),
                    "message": data.get("message", ""),
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
                    "user_id": user_id,
                    "is_typing": data.get("is_typing", False)
                }, trip_id, exclude_user=user_id)

            elif data.get("type") == "read":
                await db.trip_messages.update_many(
                    {"trip_id": trip_id, "sender_id": {"$ne": user_id}},
                    {"$set": {"is_read": True}}
                )
                await chat_manager.broadcast_to_trip({
                    "type": "messages_read",
                    "user_id": user_id
                }, trip_id, exclude_user=user_id)

    except WebSocketDisconnect:
        chat_manager.disconnect(websocket, trip_id, user_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        chat_manager.disconnect(websocket, trip_id, user_id)
