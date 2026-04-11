/**
 * NEXRYDE Voice Command System (Pidgin Support)
 * "Talk am, we go hear you" - Voice control in Nigerian Pidgin
 * 
 * CONCEPT: Future feature for voice-based ride booking in Pidgin
 */
import { BACKEND_URL } from '@/src/services/api';

export interface VoiceCommand {
  phrase: string; // What user says
  intent: string; // What they mean
  action: () => void; // What happens
  language: 'en' | 'pcm' | 'yo' | 'ig' | 'ha';
}

/**
 * NIGERIAN PIDGIN VOICE COMMANDS
 * 
 * Users can speak naturally in Pidgin to control the app!
 */
export const PIDGIN_VOICE_COMMANDS: VoiceCommand[] = [
  // Booking Commands
  {
    phrase: 'I wan go Yaba',
    intent: 'book_ride_to_destination',
    action: () => console.log('Book ride to Yaba'),
    language: 'pcm',
  },
  {
    phrase: 'Where driver dey?',
    intent: 'check_driver_location',
    action: () => console.log('Show driver location'),
    language: 'pcm',
  },
  {
    phrase: 'Call the driver',
    intent: 'call_driver',
    action: () => console.log('Call driver'),
    language: 'pcm',
  },
  {
    phrase: 'Cancel this trip',
    intent: 'cancel_ride',
    action: () => console.log('Cancel ride'),
    language: 'pcm',
  },
  
  // Safety Commands
  {
    phrase: 'Send SOS',
    intent: 'trigger_emergency',
    action: () => console.log('Trigger SOS'),
    language: 'pcm',
  },
  {
    phrase: 'Share my location',
    intent: 'share_trip',
    action: () => console.log('Share trip with contacts'),
    language: 'pcm',
  },
  
  // Information Commands
  {
    phrase: 'How much be the price?',
    intent: 'check_fare',
    action: () => console.log('Show fare estimate'),
    language: 'pcm',
  },
  {
    phrase: 'How far e go reach?',
    intent: 'check_eta',
    action: () => console.log('Show ETA'),
    language: 'pcm',
  },
  {
    phrase: 'Show me my money',
    intent: 'check_balance',
    action: () => console.log('Show wallet balance'),
    language: 'pcm',
  },
  
  // Navigation Commands
  {
    phrase: 'Take me home',
    intent: 'go_home',
    action: () => console.log('Book ride to saved home address'),
    language: 'pcm',
  },
  {
    phrase: 'Where I dey?',
    intent: 'current_location',
    action: () => console.log('Show current location'),
    language: 'pcm',
  },
  
  // Driver Commands
  {
    phrase: 'Go online',
    intent: 'driver_go_online',
    action: () => console.log('Set driver online'),
    language: 'pcm',
  },
  {
    phrase: 'I wan rest small',
    intent: 'take_break',
    action: () => console.log('Start driver break'),
    language: 'pcm',
  },
  {
    phrase: 'How much I make today?',
    intent: 'check_earnings',
    action: () => console.log('Show today earnings'),
    language: 'pcm',
  },
];

/**
 * VOICE COMMAND EXAMPLES BY SCENARIO
 */
export const VOICE_COMMAND_EXAMPLES = {
  booking: [
    'I wan go Lekki', // I want to go to Lekki
    'Book ride to VI', // Book ride to Victoria Island
    'Take me go market', // Take me to the market
    'I dey go work', // I'm going to work
  ],
  
  checking: [
    'Where my driver dey?', // Where is my driver?
    'How much be am?', // How much is it?
    'Wetin be the time?', // What's the ETA?
    'Show me my trips', // Show my trips
  ],
  
  emergency: [
    'I need help o!', // I need help!
    'Send SOS sharp sharp', // Send SOS quickly
    'Area boy dey here', // Area boys are here
    'Call police', // Call police
  ],
  
  driver: [
    'Accept this trip', // Accept this trip
    'Start the journey', // Start the trip
    'I don reach', // I have arrived
    'Make I rest small', // Let me rest
  ],
};

/**
 * VOICE RECOGNITION PATTERNS (Pidgin)
 * 
 * Common Pidgin phrases and their English equivalents for NLP
 */
export const PIDGIN_PATTERNS = {
  // Want/Need
  'I wan': 'I want',
  'Make I': 'Let me',
  'I go': 'I will',
  
  // Questions
  'Wetin': 'What',
  'Where': 'Where',
  'How far': 'How',
  'How much': 'How much',
  
  // Location
  'dey': 'is/at',
  'for': 'at/in',
  'go': 'go to',
  
  // Actions
  'Show me': 'Show',
  'Take me': 'Take',
  'Call': 'Call',
  'Send': 'Send',
  
  // Time/Speed
  'sharp sharp': 'quickly',
  'now now': 'right now',
  'small': 'a little',
  
  // Affirmation
  'E don do': 'It\'s okay',
  'Confam': 'Confirm',
  'No wahala': 'No problem',
};

/**
 * FUTURE IMPLEMENTATION:
 * 
 * 1. Speech-to-Text (Pidgin support via Google Cloud Speech API)
 * 2. Natural Language Processing (Pidgin intent recognition)
 * 3. Voice Response (Text-to-Speech in Pidgin)
 * 4. Offline Voice Commands (basic commands work offline)
 * 5. Voice Authentication (speaker recognition)
 * 
 * BENEFITS:
 * - 🎯 Mass market appeal (75M+ Pidgin speakers)
 * - 🚗 Hands-free for drivers (safer driving)
 * - 👴 Accessible to illiterate users
 * - 🇳🇬 Uniquely Nigerian (no competitor has this)
 * - 📱 Modern tech meets local language
 */

export class VoiceCommandService {
  /**
   * Process voice input (future implementation)
   */
  static async processVoiceCommand(audioInput: string, language: 'pcm' | 'en' = 'pcm'): Promise<VoiceCommand | null> {
    // TODO: Integrate with speech recognition service
    // TODO: Use NLP to extract intent
    // TODO: Match to command and execute
    
    console.log('Voice command received:', audioInput);
    return null;
  }
  
  /**
   * Convert Pidgin phrase to intent
   */
  static parseIntent(phrase: string): string {
    const lowerPhrase = phrase.toLowerCase();
    
    // Simple pattern matching (production would use ML/NLP)
    if (lowerPhrase.includes('wan go') || lowerPhrase.includes('take me')) {
      return 'book_ride';
    }
    if (lowerPhrase.includes('where') && lowerPhrase.includes('driver')) {
      return 'check_driver_location';
    }
    if (lowerPhrase.includes('sos') || lowerPhrase.includes('help')) {
      return 'trigger_emergency';
    }
    if (lowerPhrase.includes('how much') || lowerPhrase.includes('price')) {
      return 'check_fare';
    }
    
    return 'unknown';
  }
  
  /**
   * Get voice feedback in Pidgin
   */
  static getVoiceResponse(intent: string, language: 'pcm' = 'pcm'): string {
    const responses: Record<string, string> = {
      book_ride: 'We dey find driver for you...',
      check_driver_location: 'Driver dey come, e go reach soon',
      trigger_emergency: 'We don send SOS, help dey come',
      check_fare: 'Press Calculate Fare to see the price',
      unknown: 'I no understand, talk am again',
    };
    
    return responses[intent] || responses.unknown;
  }
}

/**
 * MARKETING COPY FOR VOICE COMMANDS:
 * 
 * "TALK AM, WE GO HEAR YOU! 🗣️"
 * 
 * No need to type again!
 * Just talk in Pidgin:
 * 
 * 🗣️ "I wan go Yaba"
 * 🗣️ "Where driver dey?"
 * 🗣️ "How much be am?"
 * 🗣️ "Send SOS sharp sharp"
 * 
 * NEXRYDE - The app wey understand you!
 * #TalkAm #NaijaPidgin #VoiceCommands
 */

/** Process voice command through AI backend (Emergent LLM → GPT-4o) */
export async function processCommandWithAI(userId: string, command: string): Promise<any> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ai/driver-assistant?user_id=${userId}&question=${encodeURIComponent(command)}`);
    return await res.json();
  } catch { return null; }
}
