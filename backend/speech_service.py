"""
Google Cloud Speech-to-Text Service
Configured for Nigerian English, Pidgin, and Cities
"""

import os
import logging
from google.cloud import speech
from google.cloud.speech import RecognitionConfig, RecognitionAudio, SpeechContext
from nigerian_vocabulary import (
    get_all_vocabulary, 
    normalize_city_name, 
    extract_destination_from_pidgin,
    NIGERIAN_CITIES,
    NIGERIAN_STATES,
)

# Set up logging
logger = logging.getLogger(__name__)

# Set credentials from environment variable
speech_key_path = os.getenv("GOOGLE_CLOUD_SPEECH_KEY", "nexryde-speech-key.json")
if os.path.exists(speech_key_path):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = speech_key_path
    logger.info(f"✅ Google Cloud credentials set: {speech_key_path}")
else:
    logger.warning(f"⚠️ Google Cloud credentials file not found: {speech_key_path}")

# Initialize Speech client
try:
    speech_client = speech.SpeechClient()
    logger.info("✅ Google Cloud Speech client initialized")
except Exception as e:
    logger.error(f"❌ Failed to initialize Speech client: {e}")
    speech_client = None

def create_speech_config() -> RecognitionConfig:
    """
    Create Google Cloud Speech config optimized for Nigerian users
    """
    # Get Nigerian vocabulary (cities, states, Pidgin)
    vocabulary = get_all_vocabulary()
    
    logger.info(f"📚 Loaded {len(vocabulary)} Nigerian vocabulary words")
    
    config = RecognitionConfig(
        # Audio encoding
        encoding=RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=16000,
        audio_channel_count=1,
        
        # Language settings - PRIMARY: Nigerian English!
        language_code="en-NG",  # Nigerian English (most important!)
        alternative_language_codes=[
            "en-US",  # Fallback to US English
            "en-GB",  # British English (colonial influence)
        ],
        
        # Enhanced features
        enable_automatic_punctuation=True,
        use_enhanced=True,  # Better accuracy (costs slightly more but worth it)
        model="latest_long",  # Best model for speech up to a few minutes
        
        # Nigerian-specific customization (VERY IMPORTANT!)
        speech_contexts=[
            # High priority: Nigerian cities and states
            SpeechContext(
                phrases=NIGERIAN_CITIES + NIGERIAN_STATES,
                boost=20.0,  # Very high boost for cities/states
            ),
            # Medium priority: All vocabulary (includes Pidgin)
            SpeechContext(
                phrases=vocabulary,
                boost=15.0,  # High boost for all Nigerian terms
            ),
        ],
        
        # Recognition features
        enable_word_time_offsets=False,  # Don't need timestamps
        enable_word_confidence=True,  # Get confidence per word
        max_alternatives=3,  # Get top 3 interpretations
        
        # Profanity filter (disable - we want real speech)
        profanity_filter=False,
    )
    
    return config

async def transcribe_audio(audio_content: bytes) -> dict:
    """
    Transcribe audio to text with Nigerian customization
    
    Args:
        audio_content: Raw audio bytes (m4a format)
    
    Returns:
        {
            "success": bool,
            "transcript": str,  # Raw transcript
            "normalized_transcript": str,  # Normalized (VI → Victoria Island)
            "destination": str,  # Extracted destination
            "confidence": float,  # 0.0 to 1.0
            "alternatives": list[str],  # Other possible transcripts
        }
    """
    if not speech_client:
        logger.error("❌ Speech client not initialized")
        return {
            "success": False,
            "error": "Speech service not configured",
            "transcript": "",
            "confidence": 0.0,
        }
    
    try:
        logger.info(f"🎤 Transcribing audio ({len(audio_content)} bytes)...")
        
        # Create audio object
        audio = RecognitionAudio(content=audio_content)
        
        # Create config
        config = create_speech_config()
        
        # Recognize speech (synchronous - for audio < 1 minute)
        response = speech_client.recognize(config=config, audio=audio)
        
        # Check if we got any results
        if not response.results:
            logger.warning("⚠️ No speech detected in audio")
            return {
                "success": False,
                "error": "No speech detected. Please speak clearly and try again.",
                "transcript": "",
                "confidence": 0.0,
            }
        
        # Get primary transcript
        result = response.results[0]
        primary = result.alternatives[0]
        raw_transcript = primary.transcript
        confidence = primary.confidence
        
        logger.info(f"📝 Raw transcript: '{raw_transcript}' (confidence: {confidence:.2%})")
        
        # Get alternative transcriptions
        alternatives = []
        for alt in result.alternatives[1:3]:  # Get top 3
            alternatives.append(alt.transcript)
            logger.info(f"   Alternative: '{alt.transcript}' ({alt.confidence:.2%})")
        
        # Normalize city names (VI → Victoria Island)
        normalized = normalize_city_name(raw_transcript)
        logger.info(f"🔄 Normalized: '{normalized}'")
        
        # Extract destination from Pidgin phrases
        destination = extract_destination_from_pidgin(raw_transcript)
        logger.info(f"📍 Extracted destination: '{destination}'")
        
        # Log confidence level
        if confidence < 0.5:
            logger.warning(f"⚠️ Low confidence: {confidence:.2%}")
        elif confidence < 0.7:
            logger.info(f"⚠️ Medium confidence: {confidence:.2%}")
        else:
            logger.info(f"✅ High confidence: {confidence:.2%}")
        
        return {
            "success": True,
            "transcript": raw_transcript,
            "normalized_transcript": normalized,
            "destination": destination,
            "confidence": confidence,
            "alternatives": alternatives,
        }
        
    except Exception as e:
        logger.error(f"❌ Speech transcription error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        return {
            "success": False,
            "error": f"Transcription failed: {str(e)}",
            "transcript": "",
            "confidence": 0.0,
        }

async def transcribe_streaming(audio_stream):
    """
    Real-time streaming transcription (for future enhancement)
    Use this for continuous listening (e.g., during navigation)
    """
    if not speech_client:
        logger.error("❌ Speech client not initialized")
        return
    
    try:
        config = create_speech_config()
        
        streaming_config = speech.StreamingRecognitionConfig(
            config=config,
            interim_results=True,  # Get partial results while speaking
        )
        
        # Convert audio stream to requests
        requests = (
            speech.StreamingRecognizeRequest(audio_content=chunk)
            for chunk in audio_stream
        )
        
        # Stream recognition
        responses = speech_client.streaming_recognize(
            streaming_config, requests
        )
        
        # Yield results as they come in
        for response in responses:
            for result in response.results:
                transcript = result.alternatives[0].transcript
                is_final = result.is_final
                confidence = result.alternatives[0].confidence if is_final else 0.0
                
                logger.info(f"🎤 {'FINAL' if is_final else 'interim'}: '{transcript}'")
                
                yield {
                    "transcript": transcript,
                    "is_final": is_final,
                    "confidence": confidence,
                }
                
    except Exception as e:
        logger.error(f"❌ Streaming transcription error: {e}")
        yield {
            "error": str(e),
            "success": False,
        }

def test_speech_service() -> dict:
    """
    Test if speech service is configured correctly
    """
    try:
        # Check if credentials file exists
        key_file = os.getenv("GOOGLE_CLOUD_SPEECH_KEY", "nexryde-speech-key.json")
        
        if not os.path.exists(key_file):
            return {
                "status": "error",
                "message": f"Credentials file not found: {key_file}",
                "configured": False,
            }
        
        # Check if Speech client is initialized
        if not speech_client:
            return {
                "status": "error",
                "message": "Speech client failed to initialize",
                "configured": False,
            }
        
        # Get vocabulary stats
        vocabulary = get_all_vocabulary()
        
        return {
            "status": "success",
            "message": "Voice service configured correctly",
            "configured": True,
            "credentials_file": key_file,
            "language": "en-NG (Nigerian English)",
            "vocabulary_size": len(vocabulary),
            "features": [
                "Nigerian English accent recognition",
                "Pidgin support",
                f"{len(NIGERIAN_STATES)} Nigerian states",
                f"{len(NIGERIAN_CITIES)} Nigerian cities",
                "Custom vocabulary training",
                "Real-time transcription",
                "Confidence scoring",
            ]
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "configured": False,
        }

if __name__ == "__main__":
    # Test the service
    import asyncio
    
    print("🧪 Testing Nigerian Speech Service\n")
    
    test_result = test_speech_service()
    print(f"Status: {test_result['status']}")
    print(f"Message: {test_result['message']}")
    print(f"Configured: {test_result['configured']}")
    
    if test_result['configured']:
        print(f"\n✅ Features:")
        for feature in test_result['features']:
            print(f"   - {feature}")
