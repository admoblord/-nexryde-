/**
 * NEXRYDE AI Trip Buddy Service
 * Conversational AI companion for rides
 * 
 * "Never ride alone again!" 💬
 */

import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// AI Personality Types
export type AIPersonality = 
  | 'funny'      // Comedian - jokes, humor
  | 'friendly'   // Best friend - warm, supportive
  | 'wise'       // Advisor - thoughtful, philosophical
  | 'energetic'  // Motivator - upbeat, enthusiastic
  | 'chill'      // Relaxed - calm, laid-back
  | 'local';     // Nigerian expert - knows everything about Naija

export interface AIMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
  personality: AIPersonality;
}

export interface AIPersonalityConfig {
  id: AIPersonality;
  name: string;
  icon: string;
  description: string;
  greeting: string;
  traits: string[];
  sampleTopics: string[];
}

export interface ConversationContext {
  location?: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  tripDuration?: number;
  userMood?: string;
  topics: string[];
}

/**
 * AI Personalities Configuration
 */
export const AI_PERSONALITIES: AIPersonalityConfig[] = [
  {
    id: 'funny',
    name: 'Oga Jokes',
    icon: '😂',
    description: 'Your favorite comedian! Cracks jokes, shares memes, makes you laugh',
    greeting: "Wetin dey happen boss! 😂 Ready to laugh small? I get plenty jokes for you!",
    traits: ['Humorous', 'Light-hearted', 'Entertaining', 'Playful'],
    sampleTopics: ['Nigerian jokes', 'Funny stories', 'Memes', 'Comedy'],
  },
  {
    id: 'friendly',
    name: 'Aunty Care',
    icon: '🤗',
    description: 'Your caring friend who listens and supports you',
    greeting: "Hello my dear! 🤗 How are you today? Tell me how your day is going na!",
    traits: ['Warm', 'Supportive', 'Understanding', 'Caring'],
    sampleTopics: ['Life advice', 'Motivation', 'Encouragement', 'Friendship'],
  },
  {
    id: 'wise',
    name: 'Baba Wisdom',
    icon: '🧙‍♂️',
    description: 'Shares deep thoughts, proverbs, and life lessons',
    greeting: "Greetings, my child. 🧙‍♂️ What knowledge do you seek today?",
    traits: ['Thoughtful', 'Philosophical', 'Insightful', 'Calm'],
    sampleTopics: ['Life lessons', 'Nigerian proverbs', 'Philosophy', 'Growth'],
  },
  {
    id: 'energetic',
    name: 'Boss Energy',
    icon: '⚡',
    description: 'Pumps you up with motivation and positive vibes!',
    greeting: "WHAT'S UP CHAMPION! ⚡ Ready to conquer today? Let's GO!!!",
    traits: ['Motivating', 'Upbeat', 'Enthusiastic', 'Inspiring'],
    sampleTopics: ['Success stories', 'Motivation', 'Goals', 'Hustle'],
  },
  {
    id: 'chill',
    name: 'Bro Chill',
    icon: '😎',
    description: 'Relaxed vibes, takes it easy, perfect for winding down',
    greeting: "Hey man, how far? 😎 Just relax, enjoy the ride. What's on your mind?",
    traits: ['Laid-back', 'Calm', 'Relaxed', 'Cool'],
    sampleTopics: ['Music', 'Movies', 'Sports', 'Life'],
  },
  {
    id: 'local',
    name: 'Naija Pro',
    icon: '🇳🇬',
    description: 'Knows everything about Nigeria! News, sports, culture, gist',
    greeting: "How far boss! 🇳🇬 I sabi everything wey dey happen for Naija o! Wetin you wan hear?",
    traits: ['Knowledgeable', 'Local', 'Cultural', 'Informed'],
    sampleTopics: ['Nigerian news', 'Sports', 'Politics', 'Entertainment'],
  },
];

/**
 * Nigerian Topics Database
 */
export const NIGERIAN_TOPICS = {
  sports: [
    { title: 'Super Eagles latest match', category: 'Football' },
    { title: 'Victor Osimhen in Italy', category: 'Football' },
    { title: 'Nigerian basketball team', category: 'Basketball' },
    { title: 'Local football leagues', category: 'Football' },
  ],
  news: [
    { title: 'Lagos traffic solutions', category: 'Transport' },
    { title: 'Nigerian tech startups', category: 'Technology' },
    { title: 'Naira exchange rate', category: 'Economy' },
    { title: 'Nigerian entertainment news', category: 'Entertainment' },
  ],
  culture: [
    { title: 'Nigerian jollof rice debate', category: 'Food' },
    { title: 'Afrobeats latest hits', category: 'Music' },
    { title: 'Nollywood movies', category: 'Entertainment' },
    { title: 'Nigerian fashion trends', category: 'Fashion' },
  ],
  proverbs: [
    "A child who says his mother will not sleep, he too will not sleep",
    "When the music changes, so does the dance",
    "No matter how hot your anger is, it cannot cook yam",
    "The lizard that jumped from the high iroko tree said he would praise himself if no one else did",
  ],
  jokes: [
    "Nigerian man: I'm going to America!\nFriend: When?\nMan: Tomorrow morning by God's grace\nFriend: What time?\nMan: 6am if God says yes\nFriend: Which airport?\nMan: ...If God wants 😂",
    
    "Teacher: Who can use the word 'definitely' in a sentence?\nNigerian student: The sky is definitely blue\nTeacher: Good! Anyone else?\nAnother student: Teacher, are we having test tomorrow?\nTeacher: Definitely!\nStudent: Me I didn't come to school that day 😂",
  ],
};

/**
 * AI Trip Buddy Engine
 */
export class AITripBuddy {
  /**
   * Generate AI response based on personality and context
   */
  static async generateResponse(
    userMessage: string,
    personality: AIPersonality,
    context: ConversationContext,
    conversationHistory: AIMessage[] = []
  ): Promise<string> {
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      
      // Build personality context
      const personalityConfig = AI_PERSONALITIES.find(p => p.id === personality);
      const personalityPrompt = personalityConfig 
        ? `You are ${personalityConfig.name} (${personalityConfig.icon}), ${personalityConfig.description}. Speak in this style: ${personalityConfig.traits.join(', ')}.`
        : '';
      
      // Call real OpenAI backend
      const response = await fetch(`${BACKEND_URL}/api/chat/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${personalityPrompt}\n\nUser: ${userMessage}`,
          user_id: 'ai_buddy_user',
          user_role: 'rider',
          session_id: `buddy_${Date.now()}`,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.message || 'I apologize, I could not generate a response.';
      }
      
      throw new Error('API call failed');
      
    } catch (error) {
      console.error('AI Buddy API Error:', error);
      // Fallback to local mock
      return this.generateLocalFallback(userMessage, personality, context);
    }
  }

  private static generateLocalFallback(
    userMessage: string,
    personality: AIPersonality,
    context: ConversationContext
  ): string {
    const lowerMessage = userMessage.toLowerCase();
    const intent = this.detectIntent(lowerMessage);
    
    // Generate response based on personality and intent
    switch (personality) {
      case 'funny':
        return this.generateFunnyResponse(lowerMessage, intent, context);
      case 'friendly':
        return this.generateFriendlyResponse(lowerMessage, intent, context);
      case 'wise':
        return this.generateWiseResponse(lowerMessage, intent, context);
      case 'energetic':
        return this.generateEnergeticResponse(lowerMessage, intent, context);
      case 'chill':
        return this.generateChillResponse(lowerMessage, intent, context);
      case 'local':
        return this.generateLocalResponse(lowerMessage, intent, context);
      default:
        return this.generateFriendlyResponse(lowerMessage, intent, context);
    }
  }
  
  /**
   * Detect user intent
   */
  private static detectIntent(message: string): string {
    if (/\b(joke|funny|laugh|comedy)\b/i.test(message)) return 'joke';
    if (/\b(news|happening|latest)\b/i.test(message)) return 'news';
    if (/\b(sport|football|match|eagles)\b/i.test(message)) return 'sports';
    if (/\b(advice|help|what should)\b/i.test(message)) return 'advice';
    if (/\b(music|song|artist)\b/i.test(message)) return 'music';
    if (/\b(food|jollof|amala)\b/i.test(message)) return 'food';
    if (/\b(how are|how you|how far)\b/i.test(message)) return 'greeting';
    if (/\b(thank|thanks|appreciate)\b/i.test(message)) return 'thanks';
    if (/\b(bye|later|stop)\b/i.test(message)) return 'goodbye';
    return 'general';
  }
  
  /**
   * Generate funny response (Oga Jokes personality)
   */
  private static generateFunnyResponse(message: string, intent: string, context: ConversationContext): string {
    const responses: Record<string, string[]> = {
      joke: [
        "😂 Boss! You wan hear joke? Okay... Why did the Nigerian man bring a ladder to the bar? Because he heard the drinks were on the house! 🍺",
        "😂 I get better one! Nigerian teacher ask student: 'What is the opposite of sad?' Student say: 'Happy!' Teacher: 'Good! What about the opposite of poor?' Student: 'My uncle!' 😭",
        "😂 This one go make you laugh tire! How many Nigerians does it take to change a bulb? None! We wait for NEPA to bring light first! ⚡",
      ],
      news: [
        "😂 You wan hear news? The latest gist na say Lagos traffic don add one more hour! Now na 5 hours instead of 4! 🚗😭",
        "😂 Breaking news o! Nigerian man finally reach work on time... His boss faint! They rush am to hospital! 😂",
      ],
      sports: [
        "😂 Super Eagles match? Boss, I go tell you... We go score first, celebrate like we don win World Cup, then concede 3 goals in 10 minutes! Classic Naija! ⚽",
        "😂 Victor Osimhen dey score goals for Italy, while we dey here for Lagos, dey score goals for danfo bus! 😭",
      ],
      greeting: [
        "😂 Boss I dey kampe! Just dey cruise for this Lagos traffic, telling jokes to myself! You sef how far?",
        "😂 My guy! I dey o! Sharp sharp, no dull moment! Ready to make you laugh throughout this trip!",
      ],
      general: [
        "😂 Ehen! You know say laughter na the best medicine? Make we laugh small for this trip! You get any funny story?",
        "😂 Boss, life too short to dey serious all the time! Tell me wetin you wan laugh about today!",
      ],
    };
    
    const intentResponses = responses[intent] || responses.general;
    return intentResponses[Math.floor(Math.random() * intentResponses.length)];
  }
  
  /**
   * Generate friendly response (Aunty Care personality)
   */
  private static generateFriendlyResponse(message: string, intent: string, context: ConversationContext): string {
    const responses: Record<string, string[]> = {
      greeting: [
        "🤗 Hello my dear! I'm doing well, thank you for asking! How has your day been so far?",
        "🤗 Aww, I'm good o! But more importantly, how are YOU? I hope you're taking care of yourself!",
      ],
      advice: [
        "🤗 You know what, my dear? Whatever challenge you're facing now, it will pass. Just take it one step at a time. You're stronger than you think! 💪",
        "🤗 Listen carefully... In life, not everything will go as planned, but trust me, everything will work out for your good. Keep pushing! ❤️",
      ],
      thanks: [
        "🤗 Aww, you're so welcome my dear! I'm always here if you need someone to talk to. That's what friends are for! ❤️",
        "🤗 No need to thank me o! I'm just happy I could help. Remember, I'm always here for you! 🤗",
      ],
      goodbye: [
        "🤗 Aww, so soon? Okay dear, take care of yourself! Don't forget to drink water and rest well. See you next time! ❤️",
        "🤗 Goodbye my dear! Safe journey ahead. Remember, I'm always here when you need to talk. Stay blessed! 🙏",
      ],
      general: [
        "🤗 You know what? I'm really glad we're having this conversation. It's nice to connect with you. What's on your mind today?",
        "🤗 I'm here to listen, my dear. Whether it's good news or challenges, feel free to share. I care about you! ❤️",
      ],
    };
    
    const intentResponses = responses[intent] || responses.general;
    return intentResponses[Math.floor(Math.random() * intentResponses.length)];
  }
  
  /**
   * Generate wise response (Baba Wisdom personality)
   */
  private static generateWiseResponse(message: string, intent: string, context: ConversationContext): string {
    const proverb = NIGERIAN_TOPICS.proverbs[Math.floor(Math.random() * NIGERIAN_TOPICS.proverbs.length)];
    
    const responses: Record<string, string[]> = {
      advice: [
        `🧙‍♂️ My child, remember this proverb: "${proverb}". Life is like a journey - sometimes smooth, sometimes rough. What matters is that you keep moving forward.`,
        "🧙‍♂️ In the words of our elders: 'A tree cannot make a forest.' You need people around you. Don't try to do everything alone. Seek help when needed.",
      ],
      greeting: [
        "🧙‍♂️ I am well, young one. More importantly, how is your spirit today? Are you at peace?",
        "🧙‍♂️ Greetings, my child. The day finds me in contemplation. What wisdom do you seek on this journey?",
      ],
      general: [
        `🧙‍♂️ Ponder this wisdom: "${proverb}". What does it mean to you in your current situation?`,
        "🧙‍♂️ Every journey teaches us something. What have you learned from yours today, my child?",
      ],
    };
    
    const intentResponses = responses[intent] || responses.general;
    return intentResponses[Math.floor(Math.random() * intentResponses.length)];
  }
  
  /**
   * Generate energetic response (Boss Energy personality)
   */
  private static generateEnergeticResponse(message: string, intent: string, context: ConversationContext): string {
    const responses: Record<string, string[]> = {
      greeting: [
        "⚡ BOSS! I'm FIRED UP and ready to GO! 🔥 This is YOUR day to SHINE! How are you feeling? Are you READY to CONQUER?!",
        "⚡ MY GUY! I'm at 💯 ENERGY LEVEL! Let's make TODAY COUNT! What amazing things are you working on?!",
      ],
      advice: [
        "⚡ Listen up CHAMPION! 🏆 Every obstacle is just a setup for your COMEBACK! You've got THIS! GO GET IT!",
        "⚡ BOSS! Challenges? That's just LIFE testing if you REALLY want it! And guess what? YOU DO! PUSH HARDER! 💪🔥",
      ],
      sports: [
        "⚡ SUPER EAGLES! 🦅🇳🇬 That's MY TEAM! We're going to WIN WIN WIN! Nigerian spirit never dies! LET'S GOOO!",
        "⚡ Victor Osimhen is doing AMAZING things! 🔥 That's the NIGERIAN SPIRIT! Work hard, dream BIG, SUCCEED! 💪",
      ],
      general: [
        "⚡ Every SECOND is a chance to be GREAT! You're on this ride for a REASON! Make it COUNT! What's your GOAL today?!",
        "⚡ BOSS! Life is TOO SHORT to be mediocre! GO ALL IN! What are you PASSIONATE about? Let's TALK about it!",
      ],
    };
    
    const intentResponses = responses[intent] || responses.general;
    return intentResponses[Math.floor(Math.random() * intentResponses.length)];
  }
  
  /**
   * Generate chill response (Bro Chill personality)
   */
  private static generateChillResponse(message: string, intent: string, context: ConversationContext): string {
    const responses: Record<string, string[]> = {
      greeting: [
        "😎 Hey man, I'm good, just vibing you know? Taking it easy. How about you? What's the vibe today?",
        "😎 Yo, I'm chilling boss. Just enjoying the ride, no stress. How far na, you good?",
      ],
      music: [
        "😎 Music? Bro, Afrobeats all the way! Burna Boy, Wizkid, Davido... Those guys just hit different. What you listening to?",
        "😎 Man, Nigerian music scene is fire right now! From Afrobeats to Alte, we got it all. You feeling any particular artist?",
      ],
      sports: [
        "😎 Yeah man, football is life! I'm rooting for the Super Eagles of course. But I also watch Premier League. You support any team?",
        "😎 Sports? I'm all about it boss. Football, basketball, whatever. Good way to relax. You catch the last match?",
      ],
      general: [
        "😎 You know what bro, sometimes you just gotta take it easy. Life moves fast, but we can slow down for this ride. What's on your mind?",
        "😎 Man, just going with the flow. That's the key to life - don't stress too much. What you thinking about boss?",
      ],
    };
    
    const intentResponses = responses[intent] || responses.general;
    return intentResponses[Math.floor(Math.random() * intentResponses.length)];
  }
  
  /**
   * Generate local response (Naija Pro personality)
   */
  private static generateLocalResponse(message: string, intent: string, context: ConversationContext): string {
    const responses: Record<string, string[]> = {
      news: [
        "🇳🇬 Boss, you hear the latest? Lagos State governor just announced new initiative for traffic. E go work? Only God knows! 😅",
        "🇳🇬 The gist for Naija today plenty o! Tech startups dey raise millions, entertainment industry dey boom! We dey move!",
      ],
      sports: [
        "🇳🇬 Super Eagles! My guy, those boys can play when dem want o! Victor Osimhen dey do wonders for Napoli. Proud Nigerian! 🦅",
        "🇳🇬 You know say Nigerian footballers dey everywhere now? Premier League, La Liga, Serie A... We don conquer! ⚽🇳🇬",
      ],
      food: [
        "🇳🇬 Jollof rice debate? Boss, no need for argument - Nigerian jollof is the BEST! Ghana people should rest! 😂🍚",
        "🇳🇬 Nigerian food? We get variety die! Jollof, pounded yam, suya, akara... Your stomach go thank you! What's your favorite?",
      ],
      culture: [
        "🇳🇬 Afrobeats don take over the world! From Fela to Burna Boy, Wizkid, Davido... Nigerian music is GLOBAL! 🎵🌍",
        "🇳🇬 Nollywood? We're the second largest film industry in the world! From 'Living in Bondage' to now, we've come far! 🎬",
      ],
      general: [
        "🇳🇬 Boss, I sabi everything wey dey happen for Naija! Politics, sports, entertainment, economy... Ask me anything!",
        "🇳🇬 Wetin you wan know about Nigeria? I fit gist you from Lagos to Kano, Port Harcourt to Abuja! I get the full story!",
      ],
    };
    
    const intentResponses = responses[intent] || responses.general;
    return intentResponses[Math.floor(Math.random() * intentResponses.length)];
  }
  
  /**
   * Get conversation context
   */
  static getConversationContext(): ConversationContext {
    const hour = new Date().getHours();
    let timeOfDay: ConversationContext['timeOfDay'];
    
    if (hour >= 5 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
    else timeOfDay = 'night';
    
    return {
      timeOfDay,
      topics: [],
    };
  }
}

/**
 * AI Trip Buddy React Hook
 */
export const useAITripBuddy = () => {
  const [personality, setPersonality] = useState<AIPersonality>('friendly');
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [context, setContext] = useState<ConversationContext>(AITripBuddy.getConversationContext());
  
  /**
   * Load conversation history
   */
  const loadHistory = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('@ai_buddy_messages');
      if (stored) {
        setMessages(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load conversation history:', error);
    }
  }, []);
  
  /**
   * Save conversation history
   */
  const saveHistory = useCallback(async (newMessages: AIMessage[]) => {
    try {
      await AsyncStorage.setItem('@ai_buddy_messages', JSON.stringify(newMessages));
    } catch (error) {
      console.error('Failed to save conversation history:', error);
    }
  }, []);
  
  /**
   * Send message to AI
   */
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    // Add user message
    const userMessage: AIMessage = {
      id: Date.now().toString(),
      text: text.trim(),
      sender: 'user',
      timestamp: Date.now(),
      personality,
    };
    
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    
    // Show typing indicator
    setIsTyping(true);
    
    try {
      // Simulate thinking time (500ms - 1500ms)
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      
      // Generate AI response - NOW ASYNC with real API
      const aiResponse = await AITripBuddy.generateResponse(text, personality, context, updatedMessages);
      
      const aiMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        text: aiResponse,
        sender: 'ai',
        timestamp: Date.now(),
        personality,
      };
      
      const finalMessages = [...updatedMessages, aiMessage];
      setMessages(finalMessages);
      
      // Save history
      await saveHistory(finalMessages);
    } catch (error) {
      console.error('Send message error:', error);
      // Add error message
      const errorMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, I'm having trouble connecting. Please try again.",
        sender: 'ai',
        timestamp: Date.now(),
        personality,
      };
      setMessages([...updatedMessages, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  }, [messages, personality, context, saveHistory]);
  
  /**
   * Change personality
   */
  const changePersonality = useCallback(async (newPersonality: AIPersonality) => {
    setPersonality(newPersonality);
    
    // Send greeting from new personality
    const personalityConfig = AI_PERSONALITIES.find(p => p.id === newPersonality);
    if (personalityConfig) {
      const greetingMessage: AIMessage = {
        id: Date.now().toString(),
        text: personalityConfig.greeting,
        sender: 'ai',
        timestamp: Date.now(),
        personality: newPersonality,
      };
      
      const updatedMessages = [...messages, greetingMessage];
      setMessages(updatedMessages);
      await saveHistory(updatedMessages);
    }
  }, [messages, saveHistory]);
  
  /**
   * Clear conversation
   */
  const clearConversation = useCallback(async () => {
    setMessages([]);
    await AsyncStorage.removeItem('@ai_buddy_messages');
  }, []);
  
  /**
   * Initialize
   */
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);
  
  return {
    personality,
    messages,
    isTyping,
    context,
    sendMessage,
    changePersonality,
    clearConversation,
  };
};
