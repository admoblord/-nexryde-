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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { 
  askRiderAssistant, 
  askDriverAssistant,
  askRiderAssistantPidgin,
  askDriverAssistantPidgin,
  predictEarnings
} from '@/src/services/api';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  type?: string;
  data?: any;
  timestamp: Date;
}

export default function AIAssistantScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const flatListRef = useRef<FlatList>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState<'english' | 'pidgin'>('english');

  const isDriver = user?.role === 'driver';

  useEffect(() => {
    // Add welcome message based on language
    const welcomeMessage: Message = {
      id: '0',
      text: language === 'pidgin' 
        ? (isDriver 
            ? "How far! Na KODA AI be dis. Ask me about your money, when to drive, where demand high, or how to get beta rating!"
            : "How far! Na KODA AI be dis. Ask me about your trip, where your driver dey, price matter, or safety wahala!")
        : (isDriver 
            ? "Hi! I'm your KODA driving assistant. Ask me about earnings, best times to drive, high-demand areas, or tips to improve your ratings!"
            : "Hi! I'm your KODA ride assistant. Ask me about your trip, driver location, fare details, or safety features!"),
      isUser: false,
      type: 'welcome',
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);
  }, [isDriver, language]);

  const handleSend = async () => {
    if (!inputText.trim() || !user?.id || loading) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim(),
      isUser: true,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    const question = inputText.trim();
    setInputText('');
    setLoading(true);
    
    try {
      let response;
      if (language === 'pidgin') {
        response = isDriver 
          ? await askDriverAssistantPidgin(user.id, question)
          : await askRiderAssistantPidgin(user.id, question);
      } else {
        response = isDriver 
          ? await askDriverAssistant(user.id, question)
          : await askRiderAssistant(user.id, question);
      }
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.data.response,
        isUser: false,
        type: response.data.type,
        data: response.data.data,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: language === 'pidgin' 
          ? "E get wahala. Abeg try again."
          : "Sorry, I couldn't process your request. Please try again.",
        isUser: false,
        type: 'error',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const renderSuggestions = () => {
    const suggestions = isDriver 
      ? [
          'How much have I earned today?',
          'Best time to drive?',
          'Where is demand high?',
          'Tips for better ratings',
        ]
      : [
          'Where is my driver?',
          'How much is the fare?',
          'Am I safe?',
          'How long to destination?',
        ];
    
    return (
      <View style={styles.suggestionsContainer}>
        <Text style={styles.suggestionsTitle}>Quick Questions</Text>
        <View style={styles.suggestionsList}>
          {suggestions.map((suggestion, index) => (
            <TouchableOpacity
              key={index}
              style={styles.suggestionChip}
              onPress={() => setInputText(suggestion)}
            >
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[
      styles.messageContainer,
      item.isUser ? styles.userMessageContainer : styles.aiMessageContainer
    ]}>
      {!item.isUser && (
        <View style={styles.aiAvatar}>
          <Ionicons 
            name={isDriver ? "car" : "person"} 
            size={20} 
            color={COLORS.white} 
          />
        </View>
      )}
      <View style={[
        styles.messageBubble,
        item.isUser ? styles.userBubble : styles.aiBubble
      ]}>
        <Text style={[
          styles.messageText,
          item.isUser && styles.userMessageText
        ]}>
          {item.text}
        </Text>
        
        {/* Render additional data based on type */}
        {item.data && item.type === 'earnings' && (
          <View style={styles.dataCard}>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Today</Text>
              <Text style={styles.dataValue}>₦{item.data.today_earnings?.toLocaleString() || 0}</Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Trips</Text>
              <Text style={styles.dataValue}>{item.data.today_trips || 0}</Text>
            </View>
          </View>
        )}
        
        {item.data && item.type === 'demand' && (
          <View style={styles.dataCard}>
            <Text style={styles.dataTitle}>Hot Spots:</Text>
            {item.data.hot_spots?.map((spot: string, idx: number) => (
              <View key={idx} style={styles.hotSpotRow}>
                <Ionicons name="location" size={14} color={COLORS.primary} />
                <Text style={styles.hotSpotText}>{spot}</Text>
              </View>
            ))}
          </View>
        )}
        
        {item.data && item.type === 'rating' && (
          <View style={styles.dataCard}>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={16} color={COLORS.accent} />
              <Text style={styles.ratingValue}>{item.data.rating?.toFixed(1)}</Text>
            </View>
          </View>
        )}
        
        <Text style={styles.timestamp}>
          {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.title}>
              {isDriver ? 'Driver Assistant' : 'Ride Assistant'}
            </Text>
            <View style={styles.aiIndicator}>
              <View style={styles.aiDot} />
              <Text style={styles.aiText}>AI Powered</Text>
            </View>
          </View>
          {/* Language Toggle */}
          <TouchableOpacity 
            style={styles.languageToggle}
            onPress={() => setLanguage(language === 'english' ? 'pidgin' : 'english')}
          >
            <Text style={styles.languageToggleText}>
              {language === 'english' ? '🇳🇬 Pidgin' : '🇬🇧 English'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          ListHeaderComponent={messages.length <= 1 ? renderSuggestions : null}
        />

        {/* Loading indicator */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingText}>
              {language === 'pidgin' ? 'E dey think...' : 'Thinking...'}
            </Text>
          </View>
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder={language === 'pidgin' ? 'Wetin you wan know?' : 'Ask me anything...'}
            placeholderTextColor={COLORS.gray400}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || loading}
          >
            <Ionicons 
              name="send" 
              size={20} 
              color={inputText.trim() ? COLORS.white : COLORS.gray400} 
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
    backgroundColor: COLORS.white,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  headerTitleContainer: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  aiIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  aiDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginRight: SPACING.xs,
  },
  aiText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.success,
    fontWeight: '500',
  },
  messagesList: {
    padding: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  suggestionsContainer: {
    marginBottom: SPACING.lg,
  },
  suggestionsTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  suggestionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  suggestionChip: {
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  suggestionText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontWeight: '500',
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  aiMessageContainer: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.sm,
  },
  userBubble: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  userMessageText: {
    color: COLORS.white,
  },
  timestamp: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray400,
    marginTop: SPACING.xs,
    textAlign: 'right',
  },
  dataCard: {
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  dataLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  dataValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  dataTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  hotSpotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  hotSpotText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingValue: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.accent,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  loadingText: {
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    marginRight: SPACING.sm,
    color: COLORS.textPrimary,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.gray200,
  },
});
