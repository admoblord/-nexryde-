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
import { useRouter, useLocalSearchParams, useGlobalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { useRequireUserOrLogin } from '@/src/hooks/useRequireUserOrLogin';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';
import { chatSocket, type ChatWsMessage } from '@/src/services/chatSocket';
import { useThemeColors } from '@/src/constants/theme';
import { SURFACE } from '@/src/constants/designSystem';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'driver';
  senderName?: string;
  timestamp: Date;
  isRead: boolean;
}

function pickTripIdParam(v: string | string[] | undefined): string {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim();
  return '';
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const globalParams = useGlobalSearchParams();
  const { user, currentTrip } = useAppStore();
  const authed = useRequireUserOrLogin();
  const { canCallAuthedApi } = useAuthedApiReady();
  const { userId } = useAuthedUserId();
  const { colors, isDark } = useThemeColors();
  const screenBg = isDark ? colors.background : '#F9FAFB';
  const cardBg = isDark ? SURFACE.cardDark : '#FFFFFF';
  const border = isDark ? SURFACE.hairline : '#E5E7EB';
  const textPrimary = colors.text;
  const textMuted = colors.textMuted;
  const inputBg = isDark ? SURFACE.glassSoft : '#F3F4F6';
  const otherBubbleBg = isDark ? 'rgba(34,197,94,0.12)' : '#ECFDF5';
  const otherBubbleBorder = isDark ? 'rgba(34,197,94,0.28)' : '#D1FAE5';
  const userBubbleBg = isDark ? '#1E293B' : '#111827';
  const tripId =
    pickTripIdParam(params.tripId as string | string[] | undefined) ||
    pickTripIdParam(globalParams.tripId as string | string[] | undefined);
  const driverName = (params.driverName as string) || 'Driver';
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [calling, setCalling] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const effectiveTripId = tripId || (typeof currentTrip?.id === 'string' ? currentTrip.id : '') || '';

  // Driver messages
  const [driverMessages, setDriverMessages] = useState<Message[]>([]);
  const [presetMessages, setPresetMessages] = useState<string[]>([]);

  const quickReplies = presetMessages.length > 0
    ? presetMessages
    : ["I'm here", "On my way", "Running late", "Can you wait?"];

  const messages = driverMessages;

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

  // ==================== WebSocket (singleton) ====================
  const handleChatWsMessage = useCallback(
    (data: ChatWsMessage) => {
      if (data.type === 'history') {
        const loaded: Message[] = ((data.messages as unknown[]) || []).map((m) => mapBackendMsg(m));
        setDriverMessages(loaded);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      } else if (data.type === 'new_message') {
        const newMsg = mapBackendMsg(data);
        setDriverMessages((prev) => {
          if (prev.find((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        if (data.sender_id !== userId) {
          chatSocket.send({ type: 'read' });
        }
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      } else if (data.type === 'typing') {
        if (data.user_id !== userId) {
          setOtherTyping(Boolean(data.is_typing));
          if (data.is_typing) {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3000);
          }
        }
      } else if (data.type === 'messages_read') {
        setDriverMessages((prev) =>
          prev.map((m) => (m.sender === 'user' ? { ...m, isRead: true } : m)),
        );
      }
    },
    [mapBackendMsg, userId],
  );

  useEffect(() => {
    if (!effectiveTripId || !userId || !canCallAuthedApi) {
      setWsConnected(false);
      return;
    }
    chatSocket.acquire(effectiveTripId, userId);
    const unsubMsg = chatSocket.subscribeMessages(handleChatWsMessage);
    const unsubConn = chatSocket.subscribeConnection(setWsConnected);
    return () => {
      unsubMsg();
      unsubConn();
      chatSocket.release();
      setWsConnected(false);
    };
  }, [effectiveTripId, userId, canCallAuthedApi, handleChatWsMessage]);

  useEffect(() => {
    if (!canCallAuthedApi) return;
    loadPresetMessages();
  }, [canCallAuthedApi, userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

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

  const sendDriverMessage = async (messageText: string) => {
    if (!messageText.trim() || !effectiveTripId || !userId || !canCallAuthedApi || !user) return;
    const text = messageText.trim();
    setMessage('');

    // Send via WebSocket if connected
    if (chatSocket.send({
      type: 'message',
      message: text,
      sender_role: user.role === 'driver' ? 'driver' : 'rider',
      message_type: 'text',
    })) {
      // sent via WS
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
        await fetchWithTimeout(`${BACKEND_URL}/api/chat/message`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            trip_id: effectiveTripId,
            message: text,
            message_type: 'text',
          }),
          timeoutMs: 10_000,
        });
      } catch {
        /* HTTP fallback failed */
      }
    }
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Send typing indicator via WebSocket
  const handleTypingChange = (text: string) => {
    setMessage(text);
    chatSocket.send({ type: 'typing', is_typing: text.length > 0 });
  };

  const sendMessage = async () => {
    if (!message.trim()) return;
    await sendDriverMessage(message);
  };

  const sendQuickReply = (text: string) => {
    sendDriverMessage(text);
  };

  const callDriver = async () => {
    if (!effectiveTripId || !userId || !canCallAuthedApi || !user) {
      Alert.alert('No Active Trip', 'You need an active trip to call.');
      return;
    }
    setCalling(true);
    try {
      const targetLabel = user.role === 'driver' ? 'Rider' : 'Driver';
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
    chatSocket.nudgeReconnect();
    setRefreshing(false);
  }, []);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[styles.messageContainer, isUser ? styles.userMessageContainer : styles.otherMessageContainer]}>
        {!isUser && (
          <View style={[styles.avatar, styles.driverAvatar]}>
            <Ionicons name="car" size={16} color="#FFFFFF" />
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser
              ? [styles.userBubble, { backgroundColor: userBubbleBg }]
              : [styles.driverBubble, { backgroundColor: otherBubbleBg, borderColor: otherBubbleBorder }],
          ]}
        >
          {!isUser && item.senderName && (
            <Text style={[styles.senderName, { color: isDark ? '#4ADE80' : '#059669' }]}>{item.senderName}</Text>
          )}
          <Text style={[styles.messageText, { color: isUser ? '#FFFFFF' : textPrimary }]}>{item.text}</Text>
          <View style={styles.messageFooter}>
            <Text style={[styles.messageTime, isUser ? styles.userMessageTime : { color: textMuted }]}>
              {formatTime(item.timestamp)}
            </Text>
            {isUser && item.isRead && (
              <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.7)" style={{ marginLeft: 4 }} />
            )}
          </View>
        </View>
      </View>
    );
  };

  if (!authed) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: cardBg, borderBottomColor: border }]}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: inputBg }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textPrimary }]}>Messages</Text>
          {effectiveTripId ? (
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

        {/* Chat Info Banners */}
        {!effectiveTripId && (
          <View
            style={[
              styles.infoBanner,
              styles.warningBanner,
              isDark && { backgroundColor: 'rgba(245,158,11,0.16)' },
            ]}
          >
            <Ionicons name="information-circle" size={16} color="#F59E0B" />
            <Text style={[styles.infoBannerText, styles.warningText, isDark && { color: '#FCD34D' }]}>
              Start a trip to chat with your {user?.role === 'driver' ? 'rider' : 'driver'}
            </Text>
          </View>
        )}
        {effectiveTripId && (
          <View
            style={[
              styles.infoBanner,
              wsConnected ? styles.connectedBanner : styles.disconnectedBanner,
              isDark && {
                backgroundColor: wsConnected ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
              },
            ]}
          >
            <Ionicons
              name={wsConnected ? 'wifi' : 'cloud-offline'}
              size={16}
              color={wsConnected ? '#22C55E' : '#EF4444'}
            />
            <Text
              style={[
                styles.infoBannerText,
                { color: wsConnected ? (isDark ? '#86EFAC' : '#166534') : isDark ? '#FCA5A5' : '#991B1B' },
              ]}
            >
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22C55E" />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={48} color={textMuted} />
                <Text style={[styles.emptyTitle, { color: textMuted }]}>No messages yet</Text>
                <Text style={[styles.emptyText, { color: textMuted }]}>
                  {effectiveTripId ? 'Send a message to start chatting' : 'Start a trip to begin chatting'}
                </Text>
              </View>
            }
          />

          {/* Typing Indicators */}
          {otherTyping && (
            <View style={styles.typingContainer}>
              <View style={[styles.typingBubble, { backgroundColor: otherBubbleBg }]}>
                <ActivityIndicator size="small" color="#22C55E" />
                <Text style={[styles.typingText, { color: isDark ? '#86EFAC' : '#166534' }]}>
                  {user?.role === 'driver' ? 'Rider' : 'Driver'} is typing...
                </Text>
              </View>
            </View>
          )}

          {/* Quick Replies */}
          <View style={[styles.quickRepliesContainer, { borderTopColor: border }]}>
            <FlatList
              horizontal
              data={quickReplies}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.quickReplyButton, { backgroundColor: cardBg, borderColor: border }]}
                  onPress={() => sendQuickReply(item)}
                >
                  <Text style={[styles.quickReplyText, { color: colors.textSecondary }]}>{item}</Text>
                </TouchableOpacity>
              )}
              keyExtractor={(item, index) => `${item}-${index}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRepliesList}
            />
          </View>

          {/* Input Area */}
          <View style={[styles.inputContainer, { backgroundColor: cardBg, borderTopColor: border }]}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.textInput, { backgroundColor: inputBg, color: textPrimary }]}
                placeholder="Type a message..."
                placeholderTextColor={textMuted}
                value={message}
                onChangeText={handleTypingChange}
                multiline
                maxLength={500}
                editable={!!effectiveTripId}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  { backgroundColor: message.trim() ? userBubbleBg : inputBg },
                ]}
                onPress={sendMessage}
                disabled={!message.trim() || !effectiveTripId}
              >
                <Ionicons name="send" size={20} color={message.trim() ? '#FFFFFF' : textMuted} />
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
  driverAvatar: { backgroundColor: '#22C55E' },
  messageBubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { backgroundColor: '#111827', borderBottomRightRadius: 4 },
  driverBubble: { backgroundColor: '#ECFDF5', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#D1FAE5' },
  senderName: { fontSize: 12, fontWeight: '700', color: '#059669', marginBottom: 4 },
  messageText: { fontSize: 15, color: '#111827', lineHeight: 22 },
  userMessageText: { color: '#FFFFFF' },
  messageFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  messageTime: { fontSize: 11, color: '#9CA3AF' },
  userMessageTime: { color: 'rgba(255,255,255,0.6)' },
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
  quickReplyText: { fontSize: 13, color: '#4B5563', fontWeight: '600' },
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
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#64748B', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#94A3B8', marginTop: 4, textAlign: 'center' },
});
