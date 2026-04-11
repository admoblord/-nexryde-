"""Voice Router - Nigerian-accent booking parsing with learning."""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import re

from database import db
from nigerian_vocabulary import (
    extract_destination_from_pidgin,
    normalize_city_name,
    VOCABULARY,
    NIGERIAN_CITIES,
    NIGERIAN_STATES,
    NIGERIAN_EXPRESSIONS,
)

voice_router = APIRouter(prefix="/api/voice", tags=["Voice"])

# Seeded accent-training phrases provided by product owner.
TRAINED_PHRASE_TO_DESTINATION = {
    "i wan go lekki": "Lekki, Lagos",
    "take me go vi": "Victoria Island, Lagos",
    "i dey ajah, carry me go yaba": "Yaba, Lagos",
    "from sangotedo to victoria island": "Victoria Island, Lagos",
    "book ride to ikeja": "Ikeja, Lagos",
    "make we go surulere": "Surulere, Lagos",
    "i wan reach ikoyi": "Ikoyi, Lagos",
    "take me to oshodi": "Oshodi, Lagos",
    "i wan go maryland": "Maryland, Lagos",
    "carry me go gbagada": "Gbagada, Lagos",
    "book ride to abuja": "Abuja, FCT",
    "take me go wuse 2": "Wuse 2, Abuja",
    "i wan go maitama": "Maitama, Abuja",
    "carry me go garki": "Garki, Abuja",
    "i dey kubwa, take me go jahi": "Jahi, Abuja",
    "book ride to port harcourt": "Port Harcourt, Rivers",
    "take me go ph gra": "GRA, Port Harcourt",
    "i wan go aba road ph": "Aba Road, Port Harcourt",
    "carry me go ibadan": "Ibadan, Oyo",
    "i wan go bodija": "Bodija, Ibadan",
    "book ride to kano": "Kano, Kano",
    "take me go sabon gari kano": "Sabon Gari, Kano",
    "i wan go kaduna": "Kaduna, Kaduna",
    "carry me go barnawa": "Barnawa, Kaduna",
    "i wan go enugu": "Enugu, Enugu",
    "take me go new haven enugu": "New Haven, Enugu",
    "book ride to owerri": "Owerri, Imo",
    "i wan go benin city": "Benin City, Edo",
    "take me go warri": "Warri, Delta",
    "i wan go asaba": "Asaba, Delta",
}


class VoiceParseRequest(BaseModel):
    transcript: str = Field(..., min_length=1)
    alternatives: Optional[List[str]] = None
    custom_places: Optional[List[str]] = None
    user_id: Optional[str] = None


class VoiceLearningEventRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    transcript: str = Field(..., min_length=1)
    parsed_destination: Optional[str] = None
    final_destination: Optional[str] = None
    confidence: float = 0.0
    accepted: bool = True


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _normalize_key(text: str) -> str:
    return _clean_text(text).lower()


async def _get_learning_profile(user_id: Optional[str]) -> Dict:
    if not user_id:
        return {}
    profile = await db.voice_learning_profiles.find_one({"user_id": user_id}) or {}
    return profile


def _extract_route(text: str) -> dict:
    """Extract pickup/destination from common Nigerian speech patterns."""
    raw = _clean_text(text)
    lower = raw.lower()

    patterns = [
        r"(?:from)\s+(.+?)\s+(?:to)\s+(.+)$",
        r"(?:i wan go|i want go|take me go|take me to|go to|book ride to)\s+(.+)$",
    ]

    for idx, pattern in enumerate(patterns):
        match = re.search(pattern, lower, flags=re.IGNORECASE)
        if not match:
            continue
        if idx == 0 and len(match.groups()) >= 2:
            pickup = normalize_city_name(_clean_text(match.group(1)))
            destination = normalize_city_name(_clean_text(match.group(2)))
            return {
                "intent": "book_ride",
                "pickup_text": pickup,
                "destination_text": destination,
                "confidence": 0.9,
            }
        if idx == 1 and len(match.groups()) >= 1:
            destination = normalize_city_name(_clean_text(match.group(1)))
            return {
                "intent": "book_ride",
                "pickup_text": None,
                "destination_text": destination,
                "confidence": 0.8,
            }

    inferred = normalize_city_name(extract_destination_from_pidgin(raw))
    if inferred and inferred.lower() != lower:
        return {
            "intent": "book_ride",
            "pickup_text": None,
            "destination_text": inferred,
            "confidence": 0.7,
        }

    return {
        "intent": "unknown",
        "pickup_text": None,
        "destination_text": None,
        "confidence": 0.0,
    }


@voice_router.post("/parse-booking-command")
async def parse_booking_command(request: VoiceParseRequest):
    profile = await _get_learning_profile(request.user_id)
    correction_map = profile.get("correction_map", {}) if profile else {}

    candidates = [request.transcript] + (request.alternatives or [])
    # Do not treat custom places as transcript candidates; use as hints only.

    best = {
        "intent": "unknown",
        "pickup_text": None,
        "destination_text": None,
        "confidence": 0.0,
        "transcript_used": request.transcript,
    }

    for candidate in candidates:
        key = _normalize_key(candidate)
        trained_destination = TRAINED_PHRASE_TO_DESTINATION.get(key)
        if trained_destination:
            parsed = {
                "intent": "book_ride",
                "pickup_text": None,
                "destination_text": trained_destination,
                "confidence": 0.99,
            }
            if parsed["confidence"] > best["confidence"]:
                best = {**parsed, "transcript_used": _clean_text(candidate)}
            continue

        corrected = correction_map.get(key)
        if corrected:
            parsed = {
                "intent": "book_ride",
                "pickup_text": None,
                "destination_text": corrected,
                "confidence": 0.96,
            }
        else:
            parsed = _extract_route(candidate)
        if parsed["confidence"] > best["confidence"]:
            best = {**parsed, "transcript_used": _clean_text(candidate)}

    if best["intent"] == "unknown" and request.custom_places:
        normalized_candidates = {p.lower(): p for p in request.custom_places if p}
        for candidate in candidates:
            lower = _normalize_key(candidate)
            for token_lower, token in normalized_candidates.items():
                if token_lower in lower:
                    best = {
                        "intent": "book_ride",
                        "pickup_text": None,
                        "destination_text": token,
                        "confidence": 0.62,
                        "transcript_used": _clean_text(candidate),
                    }
                    break
            if best["intent"] == "book_ride":
                break

    return {
        "success": True,
        **best,
    }


@voice_router.get("/vocabulary")
async def get_voice_vocabulary():
    """Return tuned vocabulary for Nigerian accent speech recognition."""
    prioritized = (
        NIGERIAN_EXPRESSIONS
        + NIGERIAN_STATES
        + NIGERIAN_CITIES
        + list(TRAINED_PHRASE_TO_DESTINATION.keys())
        + list(TRAINED_PHRASE_TO_DESTINATION.values())
        + [
            "book ride",
            "book now",
            "request ride",
            "find driver",
            "take me go",
            "i wan go",
            "from",
            "to",
        ]
    )

    seen = set()
    merged = []
    for token in prioritized + VOCABULARY:
        t = (token or "").strip()
        if not t:
            continue
        key = t.lower()
        if key in seen:
            continue
        seen.add(key)
        merged.append(t)

    # Keep payload bounded for mobile.
    return {"success": True, "vocabulary": merged[:600]}


@voice_router.get("/personalized-context")
async def get_personalized_context(user_id: Optional[str] = None):
    """Return personalized contextual strings that improve STT over time."""
    profile = await _get_learning_profile(user_id)
    top_places = []
    top_phrases = []
    correction_map = {}

    if profile:
        places = profile.get("place_counts", {})
        phrases = profile.get("phrase_counts", {})
        correction_map = profile.get("correction_map", {}) or {}

        top_places = [k for k, _ in sorted(places.items(), key=lambda x: x[1], reverse=True)[:80]]
        top_phrases = [k for k, _ in sorted(phrases.items(), key=lambda x: x[1], reverse=True)[:60]]

    base = (
        NIGERIAN_EXPRESSIONS
        + NIGERIAN_STATES
        + NIGERIAN_CITIES
        + list(TRAINED_PHRASE_TO_DESTINATION.keys())
        + list(TRAINED_PHRASE_TO_DESTINATION.values())
        + top_places
        + top_phrases
        + list(correction_map.values())
    )

    seen = set()
    merged = []
    for token in base + VOCABULARY:
        t = (token or "").strip()
        if not t:
            continue
        key = t.lower()
        if key in seen:
            continue
        seen.add(key)
        merged.append(t)

    return {"success": True, "contextual_strings": merged[:700]}


@voice_router.post("/learning-event")
async def save_learning_event(request: VoiceLearningEventRequest):
    """Persist voice outcomes so recognition improves for each user."""
    user_id = request.user_id
    transcript = _clean_text(request.transcript)
    if not transcript:
        return {"success": False, "message": "Empty transcript"}

    profile = await db.voice_learning_profiles.find_one({"user_id": user_id}) or {
        "user_id": user_id,
        "phrase_counts": {},
        "place_counts": {},
        "correction_map": {},
        "updated_at": None,
    }

    phrase_counts = profile.get("phrase_counts", {})
    place_counts = profile.get("place_counts", {})
    correction_map = profile.get("correction_map", {})

    phrase_key = _normalize_key(transcript)
    phrase_counts[phrase_key] = int(phrase_counts.get(phrase_key, 0)) + 1

    final_destination = _clean_text(request.final_destination or "")
    parsed_destination = _clean_text(request.parsed_destination or "")

    if final_destination:
        place_key = final_destination.lower()
        place_counts[place_key] = int(place_counts.get(place_key, 0)) + 1

    # Learn correction patterns from mismatches.
    if final_destination and parsed_destination and final_destination.lower() != parsed_destination.lower():
        correction_map[phrase_key] = final_destination
    elif request.accepted and final_destination:
        # Positive reinforcement on successful bookings.
        correction_map.setdefault(phrase_key, final_destination)

    await db.voice_learning_profiles.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "phrase_counts": phrase_counts,
                "place_counts": place_counts,
                "correction_map": correction_map,
            }
        },
        upsert=True,
    )

    return {"success": True}
