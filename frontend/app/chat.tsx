import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';

// Derive WebSocket URL from BACKEND_URL
const getWsUrl = () => {
  const url = BACKEND_URL.replace(/\/$/, '');
  if (url.startsWith('https://')) return url.replace('https://', 'wss://');
  if (url.startsWith('http://')) return url.replace('http://', 'ws://');
  return `wss://${url}`;
};
const WS_URL = getWsUrl();

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'driver' | 'ai';
  senderName?: string;
  timestamp: Date;
  isRead: boolean;
}

type ChatTab = 'driver' | 'ai';

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, token, currentTrip } = useAppStore();
  const tripId = params.tripId as string;
  const driverName = (params.driverName as string) || 'Driver';
  const flatListRef = useRef<FlatList>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const [activeTab, setActiveTab] = useState<ChatTab>('driver');
  const [message, setMessage] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectiveTripId = tripId || (currentTrip?.id as string) || '';

  // Driver messages
  const [driverMessages, setDriverMessages] = useState<Message[]>([]);
  const [presetMessages, setPresetMessages] = useState<string[]>([]);

  // AI messages
  const [aiMessages, setAiMessages] = useState<Message[]>([
    {
      id: 'ai-welcome',
      text: "👋 Hi! I'm your NEXRYDE AI Assistant.\n\nI can help you with:\n• Trip info & fare estimates\n• Safety tips & emergency help\n• Account & payment questions\n• Finding nearby places\n\nHow can I assist you?",
      sender: 'ai',
      timestamp: new Date(),
      isRead: true,
    },
  ]);

  const quickReplies =
    activeTab === 'driver'
      ? presetMessages.length > 0
        ? presetMessages
        : ["I'm here", "On my way", "Running late", "Can you wait?"]
      : ["Estimate fare", "Safety tips", "Report issue", "Cancel trip"];

  const messages = activeTab === 'driver' ? driverMessages : aiMessages;

  // Map a backend message to our frontend Message type
  const mapBackendMsg = useCallback((msg: any): Message => {
    const myRole = user?.role === 'driver' ? 'driver' : 'rider';
    return {
      id: msg.id,
      text: msg.message,
      sender: msg.sender_role === myRole ? 'user' : 'driver',
      senderName: msg.sender_name,
      timestamp: new Date(msg.timestamp || msg.created_at || Date.now()),
      isRead: msg.is_read ?? false,
    };
  }, [user?.role]);

  // ==================== WebSocket Connection ====================
  const connectWebSocket = useCallback(() => {
    if (!effectiveTripId || !user?.id || !token) return;
    // Cleanup existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsEndpoint = `${WS_URL}/api/ws/chat/${effectiveTripId}/${user.id}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsEndpoint);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      reconnectAttemptsRef.current = 0;
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'history') {
          // Load full message history from WebSocket
          const loaded: Message[] = (data.messages || []).map(mapBackendMsg);
          setDriverMessages(loaded);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
        } else if (data.type === 'new_message') {
          // Received a new message in real-time
          const newMsg = mapBackendMsg(data);
          setDriverMessages((prev) => {
            if (prev.find((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          // Send read receipt if the message is from others
          if (data.sender_id !== user?.id) {
            ws.send(JSON.stringify({ type: 'read' }));
          }
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        } else if (data.type === 'typing') {
          if (data.user_id !== user?.id) {
            setOtherTyping(data.is_typing);
            if (data.is_typing) {
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3000);
            }
          }
        } else if (data.type === 'messages_read') {
          setDriverMessages((prev) =>
            prev.map((m) => (m.sender === 'user' ? { ...m, isRead: true } : m))
          );
        } else if (data.type === 'connected') {
          console.log('WS handshake confirmed:', data.message);
        }
      } catch (e) {
        console.error('WS message parse error:', e);
      }
    };

    ws.onerror = (e) => {
      console.error('WebSocket error:', e);
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
      // Auto-reconnect with exponential backoff
      const attempts = reconnectAttemptsRef.current;
      if (attempts < 5) {
        const delay = Math.min(1000 * Math.pow(2, attempts), 16000);
        reconnectAttemptsRef.current = attempts + 1;
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
      }
    };
  }, [effectiveTripId, user?.id, user?.role, token, mapBackendMsg]);

  // Connect/disconnect WebSocket based on tab and tripId
  useEffect(() => {
    if (activeTab === 'driver' && effectiveTripId && user?.id && token) {
      connectWebSocket();
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [activeTab, effectiveTripId, user?.id, token, connectWebSocket]);

  useEffect(() => {
    loadAIChatHistory();
    loadPresetMessages();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const loadAIChatHistory = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/ai/history/${user.id}`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (data.messages && data.messages.length > 0) {
        setSessionId(data.session_id);
        const loaded: Message[] = data.messages.map((msg: any) => ({
          id: msg.id,
          text: msg.message,
          sender: msg.role === 'user' ? 'user' : 'ai',
          timestamp: new Date(msg.timestamp),
          isRead: true,
        }));
        setAiMessages([aiMessages[0], ...loaded]);
      }
    } catch (error) {
      console.error('Error loading AI chat:', error);
    }
  };

  const loadPresetMessages = async () => {
    try {
      const role = user?.role === 'driver' ? 'driver' : 'rider';
      const response = await fetch(`${BACKEND_URL}/api/chat/presets/${role}`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (data.presets) setPresetMessages(data.presets);
    } catch (error) {
      console.error('Error loading presets:', error);
    }
  };

  const sendAIMessage = async (messageText: string) => {
    if (!messageText.trim() || !user?.id) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      text: messageText.trim(),
      sender: 'user',
      timestamp: new Date(),
      isRead: false,
    };
    setAiMessages((prev) => [...prev, userMsg]);
    setIsAiTyping(true);
    setMessage('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/ai`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          user_id: user.id,
          message: messageText.trim(),
          user_role: user.role || 'rider',
          session_id: sessionId,
        }),
      });
      const data = await response.json();
      if (data.success && data.message) {
        setSessionId(data.session_id);
        setAiMessages((prev) => [
          ...prev,
          { id: `ai-${Date.now()}`, text: data.message, sender: 'ai', timestamp: new Date(), isRead: true },
        ]);
      } else {
        setAiMessages((prev) => [
          ...prev,
          { id: `ai-err-${Date.now()}`, text: data.message || "Sorry, please try again.", sender: 'ai', timestamp: new Date(), isRead: true },
        ]);
      }
    } catch (error) {
      setAiMessages((prev) => [
        ...prev,
        { id: `ai-err-${Date.now()}`, text: "Connection error. Please try again.", sender: 'ai', timestamp: new Date(), isRead: true },
      ]);
    }
    setIsAiTyping(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const sendDriverMessage = async (messageText: string) => {
    if (!messageText.trim() || !effectiveTripId || !user?.id) return;
    const text = messageText.trim();
    setMessage('');

    // Send via WebSocket if connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'message',
        message: text,
        sender_role: user.role === 'driver' ? 'driver' : 'rider',
        message_type: 'text',
      }));
    } else {
      // Fallback to HTTP if WebSocket is not connected
      const userMsg: Message = {
        id: Date.now().toString(),
        text,
        sender: 'user',
        timestamp: new Date(),
        isRead: false,
      };
      setDriverMessages((prev) => [...prev, userMsg]);

      try {
        await fetch(`${BACKEND_URL}/api/chat/message`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            trip_id: effectiveTripId,
            message: text,
            message_type: 'text',
          }),
        });
      } catch (error) {
        console.error('Send driver message error:', error);
      }
    }
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Send typing indicator via WebSocket
  const handleTypingChange = (text: string) => {
    setMessage(text);
    if (activeTab === 'driver' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'typing',
        is_typing: text.length > 0,
      }));
    }
  };

  const sendMessage = async () => {
    if (!message.trim()) return;
    if (activeTab === 'ai') {
      await sendAIMessage(message);
    } else {
      await sendDriverMessage(message);
    }
  };

  const sendQuickReply = (text: string) => {
    if (activeTab === 'ai') sendAIMessage(text);
    else sendDriverMessage(text);
  };

  const callDriver = async () => {
    if (!effectiveTripId || !user?.id) {
      Alert.alert('No Active Trip', 'You need an active trip to call.');
      return;
    }
    setCalling(true);
    try {
      const targetLabel = user?.role === 'driver' ? 'Rider' : 'Driver';
      let dialNumber = '';
      try {
        const response = await fetch(`${BACKEND_URL}/api/call/session`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            tripId: effectiveTripId,
            role: user.role || 'rider',
          }),
        });
        const data = await response.json();
        if (response.ok && data?.dialNumber) {
          dialNumber = String(data.dialNumber).replace(/\s+/g, '');
        }
      } catch {
        // Continue to final unavailable alert.
      }

      if (!dialNumber) {
        Alert.alert('Cannot Call', `${targetLabel} phone number is not available right now.`);
        return;
      }

      Alert.alert(
        `Call ${targetLabel}`,
        'This uses NEXRYDE masked calling. Your real phone number stays private.',
        [
          {
            text: 'Call via Phone',
            onPress: async () => {
              const phoneUrl = `tel:${dialNumber}`;
              try {
                await Linking.openURL(phoneUrl);
              } catch {
                Alert.alert('Call', `Dial ${dialNumber} to reach your ${targetLabel.toLowerCase()}`);
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Could not initiate call. Please try again.');
    } finally {
      setCalling(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'ai') {
      await loadAIChatHistory();
    } else {
      // Reconnect WebSocket to get fresh data
      connectWebSocket();
    }
    setRefreshing(false);
  }, [activeTab, connectWebSocket]);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    const isAI = item.sender === 'ai';
    return (
      <View style={[styles.messageContainer, isUser ? styles.userMessageContainer : styles.otherMessageContainer]}>
        {!isUser && (
          <View style={[styles.avatar, isAI ? styles.aiAvatar : styles.driverAvatar]}>
            <Ionicons name={isAI ? 'sparkles' : 'car'} size={16} color="#FFFFFF" />
          </View>
        )}
        <View style={[styles.messageBubble, isUser ? styles.userBubble : isAI ? styles.aiBubble : styles.driverBubble]}>
          {!isUser && !isAI && item.senderName && <Text style={styles.senderName}>{item.senderName}</Text>}
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>{item.text}</Text>
          <View style={styles.messageFooter}>
            <Text style={[styles.messageTime, isUser && styles.userMessageTime]}>{formatTime(item.timestamp)}</Text>
            {isAI && (
              <View style={styles.poweredBy}>
                <Text style={styles.poweredByText}>GPT-4o</Text>
              </View>
            )}
            {isUser && item.isRead && (
              <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.7)" style={{ marginLeft: 4 }} />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Messages</Text>
          {activeTab === 'driver' && effectiveTripId ? (
            <TouchableOpacity style={styles.callButton} onPress={callDriver} disabled={calling}>
              {calling ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="call" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'ai' && styles.activeTab]}
            onPress={() => setActiveTab('ai')}
          >
            <Ionicons name="sparkles" size={18} color={activeTab === 'ai' ? '#FFFFFF' : '#6B7280'} />
            <Text style={[styles.tabText, activeTab === 'ai' && styles.activeTabText]}>AI Assistant</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'driver' && styles.activeTab]}
            onPress={() => setActiveTab('driver')}
          >
            <Ionicons name="car" size={18} color={activeTab === 'driver' ? '#FFFFFF' : '#6B7280'} />
            <Text style={[styles.tabText, activeTab === 'driver' && styles.activeTabText]}>
              {user?.role === 'driver' ? 'Rider Chat' : 'Driver Chat'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Chat Info Banners */}
        {activeTab === 'ai' && (
          <View style={styles.infoBanner}>
            <Ionicons name="flash" size={16} color="#8B5CF6" />
            <Text style={styles.infoBannerText}>Powered by GPT-4o • Available 24/7</Text>
          </View>
        )}
        {activeTab === 'driver' && !effectiveTripId && (
          <View style={[styles.infoBanner, styles.warningBanner]}>
            <Ionicons name="information-circle" size={16} color="#F59E0B" />
            <Text style={[styles.infoBannerText, styles.warningText]}>
              Start a trip to chat with your {user?.role === 'driver' ? 'rider' : 'driver'}
            </Text>
          </View>
        )}
        {activeTab === 'driver' && effectiveTripId && (
          <View style={[styles.infoBanner, wsConnected ? styles.connectedBanner : styles.disconnectedBanner]}>
            <Ionicons
              name={wsConnected ? 'wifi' : 'cloud-offline'}
              size={16}
              color={wsConnected ? '#22C55E' : '#EF4444'}
            />
            <Text style={[styles.infoBannerText, { color: wsConnected ? '#166534' : '#991B1B' }]}>
              {wsConnected
                ? `Live chat active • Tap call to reach ${user?.role === 'driver' ? 'rider' : 'driver'}`
                : 'Reconnecting...'}
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />}
            ListEmptyComponent={
              activeTab === 'driver' ? (
                <View style={styles.emptyState}>
                  <Ionicons name="chatbubbles-outline" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>No messages yet</Text>
                  <Text style={styles.emptyText}>
                    {effectiveTripId ? 'Send a message to start chatting' : 'Start a trip to begin chatting'}
                  </Text>
                </View>
              ) : null
            }
          />

          {/* Typing Indicators */}
          {isAiTyping && (
            <View style={styles.typingContainer}>
              <View style={styles.typingBubble}>
                <ActivityIndicator size="small" color="#8B5CF6" />
                <Text style={styles.typingText}>AI is thinking...</Text>
              </View>
            </View>
          )}
          {otherTyping && activeTab === 'driver' && (
            <View style={styles.typingContainer}>
              <View style={[styles.typingBubble, { backgroundColor: '#DCFCE7' }]}>
                <ActivityIndicator size="small" color="#22C55E" />
                <Text style={[styles.typingText, { color: '#166534' }]}>
                  {user?.role === 'driver' ? 'Rider' : 'Driver'} is typing...
                </Text>
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
                  style={[styles.quickReplyButton, activeTab === 'ai' && styles.quickReplyButtonAI]}
                  onPress={() => sendQuickReply(item)}
                >
                  <Text style={[styles.quickReplyText, activeTab === 'ai' && styles.quickReplyTextAI]}>{item}</Text>
                </TouchableOpacity>
              )}
              keyExtractor={(item, index) => `${item}-${index}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRepliesList}
            />
          </View>

          {/* Input Area */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                placeholder={activeTab === 'ai' ? 'Ask AI anything...' : 'Type a message...'}
                placeholderTextColor="#9CA3AF"
                value={message}
                onChangeText={activeTab === 'driver' ? handleTypingChange : setMessage}
                multiline
                maxLength={500}
                editable={activeTab === 'ai' || !!effectiveTripId}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  message.trim() && styles.sendButtonActive,
                  activeTab === 'ai' && message.trim() && styles.sendButtonAI,
                ]}
                onPress={sendMessage}
                disabled={!message.trim() || isAiTyping || (activeTab === 'driver' && !effectiveTripId)}
              >
                <Ionicons name="send" size={20} color={message.trim() ? '#FFFFFF' : '#9CA3AF'} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  callButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#22C55E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  tabContainer: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 8,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 12, backgroundColor: '#F3F4F6', gap: 6,
  },
  activeTab: { backgroundColor: '#111827' },
  tabText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  activeTabText: { color: '#FFFFFF' },
  infoBanner: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#F3E8FF', gap: 8,
  },
  infoBannerText: { fontSize: 13, color: '#7C3AED', fontWeight: '600' },
  warningBanner: { backgroundColor: '#FEF3C7' },
  warningText: { color: '#92400E' },
  connectedBanner: { backgroundColor: '#DCFCE7' },
  disconnectedBanner: { backgroundColor: '#FEE2E2' },
  keyboardView: { flex: 1 },
  messagesList: { paddingHorizontal: 16, paddingVertical: 8, flexGrow: 1 },
  messageContainer: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  userMessageContainer: { justifyContent: 'flex-end' },
  otherMessageContainer: { justifyContent: 'flex-start' },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  aiAvatar: { backgroundColor: '#8B5CF6' },
  driverAvatar: { backgroundColor: '#22C55E' },
  messageBubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { backgroundColor: '#111827', borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E5E7EB' },
  driverBubble: { backgroundColor: '#ECFDF5', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#D1FAE5' },
  senderName: { fontSize: 12, fontWeight: '700', color: '#059669', marginBottom: 4 },
  messageText: { fontSize: 15, color: '#111827', lineHeight: 22 },
  userMessageText: { color: '#FFFFFF' },
  messageFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  messageTime: { fontSize: 11, color: '#9CA3AF' },
  userMessageTime: { color: 'rgba(255,255,255,0.6)' },
  poweredBy: { marginLeft: 6, backgroundColor: '#F3E8FF', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  poweredByText: { fontSize: 9, fontWeight: '700', color: '#8B5CF6' },
  typingContainer: { paddingHorizontal: 16, paddingBottom: 4 },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F3E8FF', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, alignSelf: 'flex-start',
  },
  typingText: { fontSize: 13, color: '#7C3AED', fontWeight: '600' },
  quickRepliesContainer: { borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  quickRepliesList: { paddingHorizontal: 12, paddingVertical: 8 },
  quickReplyButton: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#FFFFFF', marginHorizontal: 4,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  quickReplyButtonAI: { borderColor: '#DDD6FE', backgroundColor: '#FAF5FF' },
  quickReplyText: { fontSize: 13, color: '#4B5563', fontWeight: '600' },
  quickReplyTextAI: { color: '#7C3AED' },
  inputContainer: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  inputWrapper: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  textInput: {
    flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, paddingRight: 12,
    fontSize: 15, color: '#111827', maxHeight: 100,
  },
  sendButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center',
  },
  sendButtonActive: { backgroundColor: '#111827' },
  sendButtonAI: { backgroundColor: '#8B5CF6' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#64748B', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#94A3B8', marginTop: 4, textAlign: 'center' },
});
