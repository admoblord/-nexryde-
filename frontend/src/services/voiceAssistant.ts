/**
 * NEXRYDE Voice Assistant Service
 * AI-Powered Voice Control with Nigerian Accent Recognition
 * 
 * "Talk am, we go hear you!" 🎤
 */

import { useState, useEffect, useCallback } from 'react';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';

// Voice Assistant Types
export type VoiceLanguage = 'en' | 'pcm' | 'yo' | 'ig' | 'ha';
export type VoiceIntent = 
  | 'book_ride'
  | 'check_driver'
  | 'cancel_ride'
  | 'check_fare'
  | 'check_eta'
  | 'go_online'
  | 'go_offline'
  | 'accept_ride'
  | 'start_trip'
  | 'complete_trip'
  | 'check_earnings'
  | 'take_break'
  | 'trigger_sos'
  | 'share_trip'
  | 'check_balance'
  | 'unknown';

export interface VoiceCommand {
  text: string;
  intent: VoiceIntent;
  confidence: number;
  language: VoiceLanguage;
  params?: Record<string, any>;
}

export interface VoiceResponse {
  text: string;
  speech: string;
  action?: () => void;
}

/**
 * NIGERIAN ACCENT PATTERNS
 * Common speech patterns in Nigerian English
 */
export const NIGERIAN_ACCENT_PATTERNS = {
  // Pronunciation variations
  'dis': 'this',
  'dat': 'that',
  'dey': 'they/are',
  'dem': 'them',
  'sef': 'self/even',
  'na': 'is/it is',
  'wetin': 'what',
  'abeg': 'please',
  'oya': 'come on/hurry',
  'shey': 'isn\'t it',
  'o': 'oh/emphasis',
  
  // Common expressions
  'how far': 'how are you',
  'e don do': 'it\'s okay',
  'no wahala': 'no problem',
  'I dey come': 'I\'m coming',
  'I go': 'I will',
  'make we': 'let\'s',
  'sharp sharp': 'quickly',
  'small small': 'gradually',
  'now now': 'right now',
  'just now': 'very soon',
};

/**
 * NIGERIAN SLANG LOCATIONS
 * How Nigerians pronounce popular locations
 */
export const NIGERIAN_LOCATIONS = {
  // Lagos
  'VI': 'Victoria Island',
  'V.I.': 'Victoria Island',
  'Eko': 'Lagos',
  'Lekky': 'Lekki',
  'Ikeja': 'Ikeja',
  'Ajah': 'Ajah',
  'Badagry': 'Badagry',
  'Festac': 'Festac',
  'Surulere': 'Surulere',
  'Yaba': 'Yaba',
  'Apapa': 'Apapa',
  'Oshodi': 'Oshodi',
  'Marina': 'Marina',
  'CMS': 'CMS',
  'Mile 2': 'Mile 2',
  'Berger': 'Berger',
  
  // Abuja
  'Wuse': 'Wuse',
  'Garki': 'Garki',
  'Maitama': 'Maitama',
  'Asokoro': 'Asokoro',
  'Gwarinpa': 'Gwarinpa',
  
  // Port Harcourt
  'PH': 'Port Harcourt',
  'Portharcourt': 'Port Harcourt',
  'GRA': 'GRA',
};

/**
 * Voice Assistant AI Engine
 */
export class VoiceAssistantAI {
  /**
   * Normalize Nigerian speech to standard text
   */
  static normalizeNigerianSpeech(text: string): string {
    let normalized = text.toLowerCase().trim();
    
    // Replace Nigerian accent patterns
    Object.entries(NIGERIAN_ACCENT_PATTERNS).forEach(([pattern, replacement]) => {
      const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
      normalized = normalized.replace(regex, replacement);
    });
    
    // Replace location shortcuts
    Object.entries(NIGERIAN_LOCATIONS).forEach(([shorthand, full]) => {
      const regex = new RegExp(`\\b${shorthand}\\b`, 'gi');
      normalized = normalized.replace(regex, full);
    });
    
    return normalized;
  }
  
  /**
   * Detect language from speech
   */
  static detectLanguage(text: string): VoiceLanguage {
    const lowerText = text.toLowerCase();
    
    // Pidgin indicators
    const pidginWords = ['wetin', 'dey', 'wan', 'don', 'abeg', 'oya', 'shey', 'dem', 'na'];
    if (pidginWords.some(word => lowerText.includes(word))) {
      return 'pcm';
    }
    
    // Yoruba indicators
    const yorubaWords = ['e', 'ẹ', 'ó', 'ọ', 'bawo', 'sebi', 'nibo'];
    if (yorubaWords.some(word => lowerText.includes(word))) {
      return 'yo';
    }
    
    // Igbo indicators
    const igboWords = ['kedu', 'nna', 'nnọọ', 'biko', 'mgbe'];
    if (igboWords.some(word => lowerText.includes(word))) {
      return 'ig';
    }
    
    // Hausa indicators
    const hausaWords = ['yaya', 'ina', 'sannu', 'kai', 'to'];
    if (hausaWords.some(word => lowerText.includes(word))) {
      return 'ha';
    }
    
    return 'en';
  }
  
  /**
   * Extract intent from voice command
   */
  static extractIntent(text: string): VoiceCommand {
    const normalized = this.normalizeNigerianSpeech(text);
    const language = this.detectLanguage(text);
    
    // Book ride patterns
    if (
      /\b(book|take me|go to|i (wan|want) go|make we go|drive me)\b/i.test(normalized) ||
      /\b(lekki|yaba|ikeja|vi|victoria island|marina|surulere)\b/i.test(normalized)
    ) {
      const destination = this.extractDestination(normalized);
      return {
        text: normalized,
        intent: 'book_ride',
        confidence: 0.9,
        language,
        params: { destination },
      };
    }
    
    // Check driver location
    if (/\b(where|find|locate) .* driver\b/i.test(normalized) || /driver .* (where|location)\b/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'check_driver',
        confidence: 0.85,
        language,
      };
    }
    
    // Cancel ride
    if (/\b(cancel|stop|end) .* (ride|trip)\b/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'cancel_ride',
        confidence: 0.9,
        language,
      };
    }
    
    // Check fare/price
    if (/\b(how much|price|cost|fare)\b/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'check_fare',
        confidence: 0.85,
        language,
      };
    }
    
    // Check ETA
    if (/\b(how (long|far)|when|time|eta|arrive|reach)\b/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'check_eta',
        confidence: 0.8,
        language,
      };
    }
    
    // Driver: Go online
    if (/\b(go|set|turn|put me) (online|on)\b/i.test(normalized) && !/offline/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'go_online',
        confidence: 0.9,
        language,
      };
    }
    
    // Driver: Go offline
    if (/\b(go|set|turn|put me) (offline|off)\b/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'go_offline',
        confidence: 0.9,
        language,
      };
    }
    
    // Driver: Accept ride
    if (/\b(accept|take|grab|collect) .* (ride|trip|request)\b/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'accept_ride',
        confidence: 0.9,
        language,
      };
    }
    
    // Driver: Start trip
    if (/\b(start|begin|commence) .* (ride|trip|journey)\b/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'start_trip',
        confidence: 0.9,
        language,
      };
    }
    
    // Driver: Complete trip
    if (/\b(complete|finish|end|done) .* (ride|trip|journey)\b/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'complete_trip',
        confidence: 0.9,
        language,
      };
    }
    
    // Driver: Check earnings
    if (/\b(how much|show|check) .* (earn|make|money|cash)\b/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'check_earnings',
        confidence: 0.85,
        language,
      };
    }
    
    // Driver: Take break
    if (/\b(take|have|need) .* (break|rest)\b/i.test(normalized) || /\b(rest|sleep|tired|fatigue)\b/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'take_break',
        confidence: 0.8,
        language,
      };
    }
    
    // Emergency SOS
    if (/\b(help|sos|emergency|danger|police)\b/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'trigger_sos',
        confidence: 0.95,
        language,
      };
    }
    
    // Share trip
    if (/\b(share|send) .* (trip|location)\b/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'share_trip',
        confidence: 0.85,
        language,
      };
    }
    
    // Check balance
    if (/\b(balance|wallet|money|cash|account)\b/i.test(normalized)) {
      return {
        text: normalized,
        intent: 'check_balance',
        confidence: 0.8,
        language,
      };
    }
    
    // Unknown intent
    return {
      text: normalized,
      intent: 'unknown',
      confidence: 0.3,
      language,
    };
  }
  
  /**
   * Extract destination from text
   */
  static extractDestination(text: string): string | undefined {
    // Common location patterns
    const locationPatterns = [
      /\b(?:to|go to|going to|take me to|drive me to)\s+([a-z\s]+?)(?:\s|$|,|\.|!|\?)/i,
      /\b(lekki|yaba|ikeja|vi|victoria island|marina|surulere|oshodi|apapa|festac|badagry|ajah|ikoyi|maryland|gbagada|ojuelegba|mushin|ajegunle|ebute metta|costain|iyana ipaja|egbeda|idimu|isolo|okota|ago palace|cele|ijesha|palm grove|onipanu|shomolu|bariga|alapere|ketu|mile 12|owode|ikorodu|epe|sangotedo|agungi|chevron|abraham adesanya|obalende|falomo|onikan|tafawa balewa square|tinubu|idumota|balogun|okobaba|sabo|ebute ero|ijora|isale eko|iddo|oyingbo|lawanson|itire|diobu|rumuokoro|eliozu|airport road|aba road|wuse|garki|maitama|asokoro|gwarinpa|kubwa|nyanya|karu|lugbe|jahi|utako|life camp|guzape|katampe|jikwoyi|kuje|gwagwalada|suleja|madalla|zuba|lokoja|kaduna|ibadan|abeokuta|ota|ijebu ode|shagamu|benin|warri|sapele|asaba|onitsha|owerri|aba|umuahia|calabar|uyo|akure|ado ekiti|osogbo|ogbomosho|ilorin|jos|bauchi|gombe|yola|maiduguri|sokoto|katsina|kano|zaria)\b/i,
    ];
    
    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) {
        const destination = match[1] || match[0];
        return destination.trim();
      }
    }
    
    return undefined;
  }
  
  /**
   * Generate voice response based on intent
   */
  static generateResponse(command: VoiceCommand, language: VoiceLanguage = 'pcm'): VoiceResponse {
    const responses: Record<VoiceIntent, Record<VoiceLanguage, string>> = {
      book_ride: {
        en: `Booking your ride${command.params?.destination ? ` to ${command.params.destination}` : ''}. Searching for drivers...`,
        pcm: `We dey book ride for you${command.params?.destination ? ` go ${command.params.destination}` : ''}. We dey find driver...`,
        yo: `A ń ṣètò ìrìn-àjò rẹ${command.params?.destination ? ` sí ${command.params.destination}` : ''}. A ń wá awakọ̀...`,
        ig: `Anyị na-akwụ njem gị${command.params?.destination ? ` gaa ${command.params.destination}` : ''}. Anyị na-achọ ọkwọ ụgbọala...`,
        ha: `Muna ajiyar tafiyar ku${command.params?.destination ? ` zuwa ${command.params.destination}` : ''}. Muna neman direba...`,
      },
      check_driver: {
        en: 'Your driver is 5 minutes away and heading to your pickup location.',
        pcm: 'Driver dey come, e go reach 5 minutes time. E dey come pick you now.',
        yo: 'Awakọ̀ rẹ yóò dé ní ìṣẹ́jú márùn-ún, ó sì ń bọ̀ wá ibi ìgbémú rẹ.',
        ig: 'Ọkwọ ụgbọala gị nọ nso, ọ ga-abịa na nkeji ise. Ọ na-abịa ịbụrụ gị ugbu a.',
        ha: 'Direba na zuwa, zai isa cikin minti biyar. Yana zuwa daukar ku yanzu.',
      },
      cancel_ride: {
        en: 'Canceling your current ride. Would you like to book another one?',
        pcm: 'We don cancel the ride. You wan book another one?',
        yo: 'A ti fagilé ìrìn-àjò náà. Ṣé o fẹ́ ṣètò òmíràn?',
        ig: 'Anyị akagbuola njem a. Ị chọrọ ịkwu nke ọzọ?',
        ha: 'An soke tafiyar. Kuna son ku yi ajiyar wata?',
      },
      check_fare: {
        en: 'The estimated fare for this trip is ₦1,500 to ₦2,000.',
        pcm: 'The price for this trip na between ₦1,500 and ₦2,000.',
        yo: 'Owó ọkọ̀ fún ìrìn-àjò yìí jẹ́ ₦1,500 sí ₦2,000.',
        ig: 'Ụgwọ njem a bụ ₦1,500 ruo ₦2,000.',
        ha: 'Kudin tafiyar nan tsakanin ₦1,500 zuwa ₦2,000.',
      },
      check_eta: {
        en: 'Your driver will arrive in approximately 8 minutes.',
        pcm: 'Driver go reach in 8 minutes time.',
        yo: 'Awakọ̀ yóò dé ní ìṣẹ́jú mẹ́jọ.',
        ig: 'Ọkwọ ụgbọala ga-abịa na nkeji asatọ.',
        ha: 'Direba zai isa cikin minti takwas.',
      },
      go_online: {
        en: 'You are now online. Ready to accept ride requests.',
        pcm: 'You don online now. You fit start to dey collect ride.',
        yo: 'O ti lọ sórí ayélujára báyìí. O ti ṣetán láti gba àwọn ìbéèrè ìrìn-àjò.',
        ig: 'Ị nọ n\'ịntanetị ugbu a. Ị dị njikere ịnabata njem.',
        ha: 'Kun shiga layi yanzu. Kun shirya karban tafiyoyi.',
      },
      go_offline: {
        en: 'You are now offline. You will not receive new ride requests.',
        pcm: 'You don go offline. You no go see new ride request again.',
        yo: 'O ti jáde lórí ayélujára. O ò ní gba àwọn ìbéèrè ìrìn-àjò tuntun.',
        ig: 'Ị nọghị n\'ịntanetị ugbu a. Ị gaghị anabata njem ọhụrụ.',
        ha: 'Kun fita daga layi. Ba za ku karbi sabbin bukatun tafiya ba.',
      },
      accept_ride: {
        en: 'Ride accepted! Heading to pickup location now.',
        pcm: 'Ride don accept! We dey go pick the person now.',
        yo: 'Ìrìn-àjò ti gbà! Ó ń lọ sí ibi ìgbémú báyìí.',
        ig: 'Anabatala njem! Ọ na-aga ebe ị ga-eburu gị ugbu a.',
        ha: 'An karɓi tafiya! Ana zuwa wurin ɗaukar hawa yanzu.',
      },
      start_trip: {
        en: 'Trip started. Drive safely!',
        pcm: 'Journey don start. Make you drive well o!',
        yo: 'Ìrìn-àjò ti bẹ̀rẹ̀. Ẹ máa wakọ̀ láìléwu!',
        ig: 'Njem amalitela. Kpachara anya ka ị na-anya ụgbọala!',
        ha: 'Tafiya ta fara. Ku yi tuƙi cikin tsaro!',
      },
      complete_trip: {
        en: 'Trip completed. Great job! Ready for the next ride?',
        pcm: 'Trip don finish. Well done! You ready for another one?',
        yo: 'Ìrìn-àjò ti parí. Ó dára gan-an! Ṣé o ti ṣetán fún òmíràn?',
        ig: 'Njem emechala. Ị mere nke ọma! Ị dị njikere maka nke ọzọ?',
        ha: 'Tafiya ta ƙare. Ka yi kyau! Kuna shirya don wata?',
      },
      check_earnings: {
        en: 'You have earned ₦12,500 today from 8 completed trips.',
        pcm: 'You don make ₦12,500 today from 8 trips wey you finish.',
        yo: 'O ti jèrè ₦12,500 lónìí láti inú ìrìn-àjò mẹ́jọ.',
        ig: 'Ị nwetala ₦12,500 taa site na njem asatọ ị mechara.',
        ha: 'Kun samu ₦12,500 yau daga tafiyoyi 8 da kuka kammala.',
      },
      take_break: {
        en: 'Good idea. Starting your break now. Rest well!',
        pcm: 'Good idea. Make you rest small. Take am easy!',
        yo: 'Ọ̀rọ̀ dáadáa. Ẹ máa sinmi báyìí. Ẹ sinmi dáadáa!',
        ig: 'Echiche ọma. Were ezumike ugbu a. Zuru ike nke ọma!',
        ha: 'Kyakkyawan ra\'ayi. Ku ɗauki hutu yanzu. Ku huta sosai!',
      },
      trigger_sos: {
        en: 'EMERGENCY SOS activated! Alerting your emergency contacts and authorities now.',
        pcm: 'EMERGENCY SOS don activate! We dey call your people and police now!',
        yo: 'SOS Ìpayà ti bẹ̀rẹ̀! A ń pe àwọn ẹni ìkànsí àti àwọn aláṣẹ báyìí.',
        ig: 'SOS Mberede emeela! Anyị na-akpọ ndị ị ga-akpọ na ndị uwe ojii ugbu a!',
        ha: 'SOS Gaggawa ya fara! Muna kiran mutanenku da \'yan sanda yanzu!',
      },
      share_trip: {
        en: 'Sharing your live location with emergency contacts now.',
        pcm: 'We dey share where you dey with your people now.',
        yo: 'A ń pín ìpò rẹ láyé pẹ̀lú àwọn ẹni ìkànsí báyìí.',
        ig: 'Anyị na-ekesa ebe ị nọ ugbu a na ndị ị ga-akpọ.',
        ha: 'Muna raba inda kuke yanzu da mutanenku.',
      },
      check_balance: {
        en: 'Your wallet balance is ₦8,750.',
        pcm: 'Money wey dey your wallet na ₦8,750.',
        yo: 'Owó tó kù nínú àpamọ́wọ́ rẹ jẹ́ ₦8,750.',
        ig: 'Ego dị n\'akpa ego gị bụ ₦8,750.',
        ha: 'Kudin da ke cikin walat ɗinku ₦8,750 ne.',
      },
      unknown: {
        en: 'Sorry, I didn\'t understand that. Can you say it again?',
        pcm: 'Abeg I no understand wetin you talk. Make you talk am again?',
        yo: 'Má bínú, n kò gbọ́. Ṣé o lè sọ ọ́ lẹ́ẹ̀kan sí i?',
        ig: 'Ndo, aghọtaghị m. Ị nwere ike ikwu ya ọzọ?',
        ha: 'Yi hakuri, ban gane ba. Za ku sake faɗa?',
      },
    };
    
    const responseText = responses[command.intent]?.[language] || responses[command.intent]?.['en'] || responses['unknown'][language];
    
    return {
      text: responseText,
      speech: responseText,
    };
  }
}

/**
 * Voice Assistant React Hook
 */
export const useVoiceAssistant = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);
  const [preferredLanguage, setPreferredLanguage] = useState<VoiceLanguage>('pcm');
  const [error, setError] = useState<string | null>(null);
  
  /**
   * Start listening for voice commands
   */
  const startListening = useCallback(async () => {
    try {
      setIsListening(true);
      setError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // TODO: Integrate with actual speech recognition API
      // For now, simulate with mock data
      console.log('🎤 Voice Assistant: Listening...');
      
      // In production, use:
      // - Expo Speech (expo-speech)
      // - Google Cloud Speech-to-Text
      // - Azure Speech Services
      // - Custom WebRTC solution
      
    } catch (err) {
      console.error('Voice listening error:', err);
      setError('Failed to start listening');
      setIsListening(false);
    }
  }, []);
  
  /**
   * Stop listening
   */
  const stopListening = useCallback(() => {
    setIsListening(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log('🎤 Voice Assistant: Stopped listening');
  }, []);
  
  /**
   * Process voice input
   */
  const processVoiceInput = useCallback(async (text: string) => {
    try {
      // Extract intent
      const command = VoiceAssistantAI.extractIntent(text);
      setLastCommand(command);
      setTranscript(text);
      
      // Generate response
      const response = VoiceAssistantAI.generateResponse(command, preferredLanguage);
      
      // Speak response
      await speakResponse(response.speech);
      
      return command;
    } catch (err) {
      console.error('Voice processing error:', err);
      setError('Failed to process voice command');
      return null;
    }
  }, [preferredLanguage]);
  
  /**
   * Speak response using Text-to-Speech
   */
  const speakResponse = useCallback(async (text: string) => {
    try {
      setIsSpeaking(true);
      
      // TODO: Integrate with actual TTS API
      // For now, just log
      console.log('🗣️ Voice Assistant says:', text);
      
      // In production, use:
      // - Expo Speech (expo-speech)
      // - Google Cloud Text-to-Speech (with Nigerian accent)
      // - Azure Speech Services
      // - Custom audio playback
      
      // Simulate speaking duration
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setIsSpeaking(false);
    } catch (err) {
      console.error('Voice speaking error:', err);
      setIsSpeaking(false);
    }
  }, []);
  
  /**
   * Test voice command (for development)
   */
  const testVoiceCommand = useCallback(async (text: string) => {
    setTranscript(text);
    return await processVoiceInput(text);
  }, [processVoiceInput]);
  
  return {
    isListening,
    isSpeaking,
    transcript,
    lastCommand,
    preferredLanguage,
    error,
    startListening,
    stopListening,
    processVoiceInput,
    speakResponse,
    testVoiceCommand,
    setPreferredLanguage,
  };
};
