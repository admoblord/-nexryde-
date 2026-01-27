import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'driver';
  timestamp: Date;
  isRead: boolean;
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const driverName = params.driverName as string || 'Driver';
  const flatListRef = useRef<FlatList>(null);
  
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([
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

  const quickReplies = [
    "I'm here",
    "On my way",
    "Running late",
    "Can you wait?",
  ];

  const sendMessage = () => {
    if (!message.trim()) return;
    
    const newMessage: Message = {
      id: Date.now().toString(),
      text: message.trim(),
      sender: 'user',
      timestamp: new Date(),
      isRead: false,
    };
    
    setMessages([...messages, newMessage]);
    setMessage('');
    
    // Auto scroll to bottom
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendQuickReply = (text: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date(),
      isRead: false,
    };
    
    setMessages([...messages, newMessage]);
    
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
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
    
    return (
      <View style={[
        styles.messageContainer,
        isUser ? styles.userMessageContainer : styles.driverMessageContainer
      ]}>
        {!isUser && (
          <View style={styles.driverAvatar}>
            <Ionicons name="person" size={16} color={COLORS.white} />
          </View>
        )}
        <View style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.driverBubble
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
            {isUser && item.isRead && (
              <Ionicons name="checkmark-done" size={14} color={COLORS.white} style={{ marginLeft: 4 }} />
            )}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          
          <View style={styles.headerInfo}>
            <View style={styles.headerAvatar}>
              <LinearGradient
                colors={[COLORS.accentGreen, COLORS.accentBlue]}
                style={styles.avatarGradient}
              >
                <Ionicons name="person" size={20} color={COLORS.white} />
              </LinearGradient>
              <View style={styles.onlineDot} />
            </View>
            <View>
              <Text style={styles.headerName}>{driverName}</Text>
              <Text style={styles.headerStatus}>Online • Your Driver</Text>
            </View>
          </View>
          
          <TouchableOpacity style={styles.callButton}>
            <Ionicons name="call" size={22} color={COLORS.accentGreen} />
          </TouchableOpacity>
        </View>

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
                placeholder="Type a message..."
                placeholderTextColor={COLORS.lightTextMuted}
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={500}
              />
              <TouchableOpacity 
                style={[styles.sendButton, message.trim() && styles.sendButtonActive]}
                onPress={sendMessage}
                disabled={!message.trim()}
              >
                <Ionicons 
                  name="send" 
                  size={20} 
                  color={message.trim() ? COLORS.white : COLORS.lightTextMuted} 
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
    backgroundColor: COLORS.lightBackground,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.lightSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  headerAvatar: {
    position: 'relative',
    marginRight: SPACING.sm,
  },
  avatarGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.accentGreen,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  headerName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  headerStatus: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accentGreen,
    fontWeight: '500',
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
    alignItems: 'flex-end',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  driverMessageContainer: {
    justifyContent: 'flex-start',
  },
  driverAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.xs,
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl,
  },
  userBubble: {
    backgroundColor: COLORS.accentGreen,
    borderBottomRightRadius: 4,
  },
  driverBubble: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  messageText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
    lineHeight: 22,
  },
  userMessageText: {
    color: COLORS.white,
  },
  messageTime: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextMuted,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  userMessageTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  quickRepliesContainer: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
    paddingVertical: SPACING.sm,
  },
  quickRepliesList: {
    paddingHorizontal: SPACING.md,
  },
  quickReplyButton: {
    backgroundColor: COLORS.lightSurface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  quickReplyText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextPrimary,
    fontWeight: '500',
  },
  inputContainer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.xl,
    paddingLeft: SPACING.md,
    paddingRight: 4,
    paddingVertical: 4,
  },
  textInput: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
    maxHeight: 100,
    paddingVertical: SPACING.sm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.lightBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonActive: {
    backgroundColor: COLORS.accentGreen,
  },
});
