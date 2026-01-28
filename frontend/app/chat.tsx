import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'driver' | 'ai';
  timestamp: Date;
  isRead: boolean;
  isLoading?: boolean;
}

type ChatTab = 'driver' | 'ai';

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const driverName = params.driverName as string || 'Driver';
  const flatListRef = useRef<FlatList>(null);
  
  const [activeTab, setActiveTab] = useState<ChatTab>('ai');
  const [message, setMessage] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  
  // Driver messages
  const [driverMessages, setDriverMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello! I'm on my way to pick you up.",
      sender: 'driver',
      timestamp: new Date(Date.now() - 300000),
      isRead: true,
    },
    {
      id: '2',
      text: "Great, I'll be waiting at the entrance.",
      sender: 'user',
      timestamp: new Date(Date.now() - 240000),
      isRead: true,
    },
    {
      id: '3',
      text: "I'm about 5 minutes away. The traffic is light.",
      sender: 'driver',
      timestamp: new Date(Date.now() - 120000),
      isRead: true,
    },
  ]);
  
  // AI messages
  const [aiMessages, setAiMessages] = useState<Message[]>([
    {
      id: 'ai-welcome',
      text: "👋 Hi! I'm your NEXRYDE AI Assistant. I can help you with:\n\n• Trip information & fare estimates\n• Safety tips & emergency help\n• Account & payment questions\n• Finding nearby places\n\nHow can I assist you today?",
      sender: 'ai',
      timestamp: new Date(),
      isRead: true,
    },
  ]);

  const quickReplies = activeTab === 'driver' 
    ? ["I'm here", "On my way", "Running late", "Can you wait?"]
    : ["Estimate fare", "Safety tips", "Report issue", "Help"];

  const messages = activeTab === 'driver' ? driverMessages : aiMessages;
  const setMessages = activeTab === 'driver' ? setDriverMessages : setAiMessages;

  // AI Response function
  const getAIResponse = async (userMessage: string): Promise<string> => {
    const lowerMsg = userMessage.toLowerCase();
    
    // Simulated AI responses based on keywords
    if (lowerMsg.includes('fare') || lowerMsg.includes('price') || lowerMsg.includes('cost')) {
      return "💰 **Fare Estimates**\n\nNEXRYDE fares are calculated based on:\n• Base fare: ₦500\n• Per kilometer: ₦100-150\n• Time-based rate: ₦20/min\n\nFor an exact estimate, enter your pickup and dropoff locations in the booking screen. Premium rides may have different rates.";
    }
    
    if (lowerMsg.includes('safety') || lowerMsg.includes('safe') || lowerMsg.includes('emergency')) {
      return "🛡️ **Safety Features**\n\n• **Share Trip**: Send your live location to contacts\n• **Emergency SOS**: Quick access to emergency services\n• **Driver Verification**: All drivers are verified\n• **Trip Recording**: Audio recording available\n\nFor emergencies, use the SOS button in your trip screen or call 112/199.";
    }
    
    if (lowerMsg.includes('report') || lowerMsg.includes('issue') || lowerMsg.includes('problem')) {
      return "📝 **Report an Issue**\n\nI can help you report:\n1. Driver behavior concerns\n2. Vehicle issues\n3. Payment problems\n4. Lost items\n5. Route concerns\n\nPlease describe your issue and I'll guide you through the reporting process.";
    }
    
    if (lowerMsg.includes('payment') || lowerMsg.includes('pay') || lowerMsg.includes('wallet')) {
      return "💳 **Payment Options**\n\nNEXRYDE supports:\n• Cash payment\n• Card payment (Visa, Mastercard)\n• Wallet balance\n• Bank transfer\n\nTo add a payment method, go to Profile > Wallet. Need help with a specific payment issue?";
    }
    
    if (lowerMsg.includes('cancel')) {
      return "❌ **Cancellation Policy**\n\n• Free cancellation within 2 minutes of booking\n• After driver accepts: ₦200-500 fee may apply\n• No fee if driver takes too long\n\nTo cancel a trip, tap the X button on your active trip screen.";
    }
    
    if (lowerMsg.includes('driver') || lowerMsg.includes('rating')) {
      return "⭐ **Driver Information**\n\nAll NEXRYDE drivers:\n• Complete background verification\n• Have valid licenses & permits\n• Maintain 4.5+ star ratings\n• Receive regular training\n\nYou can rate your driver after each trip to help maintain quality.";
    }
    
    if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) {
      return "Hello! 👋 I'm here to help. What would you like to know about NEXRYDE?";
    }
    
    if (lowerMsg.includes('thank')) {
      return "You're welcome! 😊 Is there anything else I can help you with?";
    }
    
    if (lowerMsg.includes('help')) {
      return "🆘 **How can I help?**\n\nI can assist with:\n• 💰 Fare estimates\n• 🛡️ Safety information\n• 💳 Payment questions\n• 📍 Trip assistance\n• 📝 Reporting issues\n• ❓ General questions\n\nJust type your question!";
    }
    
    // Default response
    return "I understand you're asking about: \"" + userMessage + "\"\n\nLet me help you with that. Could you please provide more details about what specific information you need? You can also try asking about:\n• Fares & pricing\n• Safety features\n• Payment options\n• Reporting issues";
  };

  const sendMessage = async () => {
    if (!message.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text: message.trim(),
      sender: 'user',
      timestamp: new Date(),
      isRead: false,
    };
    
    if (activeTab === 'driver') {
      setDriverMessages(prev => [...prev, userMessage]);
    } else {
      setAiMessages(prev => [...prev, userMessage]);
      
      // Show AI typing indicator
      setIsAiTyping(true);
      
      // Get AI response after a short delay
      const userText = message.trim();
      setMessage('');
      
      setTimeout(async () => {
        const aiResponse = await getAIResponse(userText);
        
        const aiMessage: Message = {
          id: `ai-${Date.now()}`,
          text: aiResponse,
          sender: 'ai',
          timestamp: new Date(),
          isRead: true,
        };
        
        setAiMessages(prev => [...prev, aiMessage]);
        setIsAiTyping(false);
        
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }, 1000 + Math.random() * 1000); // Random delay for natural feel
      
      return;
    }
    
    setMessage('');
    
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendQuickReply = (text: string) => {
    setMessage(text);
    setTimeout(() => sendMessage(), 100);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    const isAI = item.sender === 'ai';
    
    return (
      <View style={[
        styles.messageContainer,
        isUser ? styles.userMessageContainer : styles.otherMessageContainer
      ]}>
        {!isUser && (
          <View style={[styles.avatar, isAI ? styles.aiAvatar : styles.driverAvatar]}>
            <Ionicons 
              name={isAI ? "sparkles" : "person"} 
              size={16} 
              color="#FFFFFF" 
            />
          </View>
        )}
        <View style={[
          styles.messageBubble,
          isUser ? styles.userBubble : (isAI ? styles.aiBubble : styles.driverBubble)
        ]}>
          <Text style={[
            styles.messageText,
            isUser && styles.userMessageText
          ]}>
            {item.text}
          </Text>
          <Text style={[
            styles.messageTime,
            isUser && styles.userMessageTime
          ]}>
            {formatTime(item.timestamp)}
          </Text>
        </View>
      </View>
    );
  };

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: false });
  }, [activeTab]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>Messages</Text>
          
          <View style={{ width: 40 }} />
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'ai' && styles.activeTab]}
            onPress={() => setActiveTab('ai')}
          >
            <Ionicons 
              name="sparkles" 
              size={18} 
              color={activeTab === 'ai' ? '#FFFFFF' : '#6B7280'} 
            />
            <Text style={[styles.tabText, activeTab === 'ai' && styles.activeTabText]}>
              AI Assistant
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'driver' && styles.activeTab]}
            onPress={() => setActiveTab('driver')}
          >
            <Ionicons 
              name="car" 
              size={18} 
              color={activeTab === 'driver' ? '#FFFFFF' : '#6B7280'} 
            />
            <Text style={[styles.tabText, activeTab === 'driver' && styles.activeTabText]}>
              Driver Chat
            </Text>
          </TouchableOpacity>
        </View>

        {/* Chat Info Banner */}
        {activeTab === 'ai' && (
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={18} color="#3B82F6" />
            <Text style={styles.infoBannerText}>
              AI Assistant is here to help 24/7
            </Text>
          </View>
        )}

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* Messages List */}
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />

          {/* AI Typing Indicator */}
          {isAiTyping && (
            <View style={styles.typingContainer}>
              <View style={styles.typingBubble}>
                <ActivityIndicator size="small" color="#8B5CF6" />
                <Text style={styles.typingText}>AI is typing...</Text>
              </View>
            </View>
          )}

          {/* Quick Replies */}
          <View style={styles.quickRepliesContainer}>
            <FlatList
              horizontal
              data={quickReplies}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.quickReplyButton}
                  onPress={() => sendQuickReply(item)}
                >
                  <Text style={styles.quickReplyText}>{item}</Text>
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRepliesList}
            />
          </View>

          {/* Input Area */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                placeholder={activeTab === 'ai' ? "Ask AI anything..." : "Type a message..."}
                placeholderTextColor="#9CA3AF"
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={500}
              />
              <TouchableOpacity 
                style={[
                  styles.sendButton, 
                  message.trim() && styles.sendButtonActive,
                  activeTab === 'ai' && message.trim() && styles.sendButtonAI
                ]}
                onPress={sendMessage}
                disabled={!message.trim() || isAiTyping}
              >
                <Ionicons 
                  name="send" 
                  size={20} 
                  color={message.trim() ? '#FFFFFF' : '#9CA3AF'} 
                />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  activeTab: {
    backgroundColor: '#8B5CF6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  infoBannerText: {
    fontSize: 13,
    color: '#1D4ED8',
    fontWeight: '500',
  },
  keyboardView: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  otherMessageContainer: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  driverAvatar: {
    backgroundColor: '#22C55E',
  },
  aiAvatar: {
    backgroundColor: '#8B5CF6',
  },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#22C55E',
    borderBottomRightRadius: 4,
  },
  driverBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  aiBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  messageText: {
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  messageTime: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  userMessageTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  typingContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    alignSelf: 'flex-start',
    gap: 8,
  },
  typingText: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '500',
  },
  quickRepliesContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingVertical: 10,
  },
  quickRepliesList: {
    paddingHorizontal: 16,
  },
  quickReplyButton: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickReplyText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  inputContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    maxHeight: 100,
    paddingVertical: 10,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonActive: {
    backgroundColor: '#22C55E',
  },
  sendButtonAI: {
    backgroundColor: '#8B5CF6',
  },
});
