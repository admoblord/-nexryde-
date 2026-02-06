import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface CommunityGroup {
  _id: string;
  group_id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  members: number;
  recent_messages: number;
  is_official?: boolean;
}

interface GroupMessage {
  _id: string;
  group_id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  text: string;
  likes: number;
  replies: number;
  is_reply?: boolean;
  parent_id?: string;
  created_at: string;
}

export default function DriverCommunityScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/community/groups`);
      const data = await res.json();
      if (data.success) {
        setGroups(data.groups || []);
      }
    } catch (e) {
      console.error('Fetch groups error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchGroupMessages = async (groupId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/community/groups/${groupId}/messages?limit=50`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
      }
    } catch (e) {
      console.error('Fetch messages error:', e);
    } finally {
      setLoadingMessages(false);
    }
  };

  const openGroup = (group: CommunityGroup) => {
    setSelectedGroup(group);
    fetchGroupMessages(group.group_id);
  };

  const closeGroup = () => {
    setSelectedGroup(null);
    setMessages([]);
    setNewMessage('');
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedGroup) return;

    setSending(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/community/groups/${selectedGroup.group_id}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user?.id || 'anonymous',
            user_name: user?.name || 'Anonymous Driver',
            user_role: user?.role || 'driver',
            text: newMessage.trim(),
          }),
        }
      );
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [...prev, data.message]);
        setNewMessage('');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const likeMessage = async (msgId: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/community/messages/${msgId}/like`, { method: 'POST' });
      setMessages((prev) => prev.map((m) => (m._id === msgId ? { ...m, likes: m.likes + 1 } : m)));
    } catch (e) {
      console.error('Like error:', e);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGroups();
  }, []);

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Group Chat View (Modal)
  const renderGroupChat = () => (
    <Modal visible={!!selectedGroup} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        {/* Chat Header */}
        <View style={[styles.chatHeader, { backgroundColor: selectedGroup?.color || COLORS.primary }]}>
          <TouchableOpacity style={styles.chatBackBtn} onPress={closeGroup}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.chatTitle}>{selectedGroup?.name}</Text>
            <Text style={styles.chatSubtitle}>{messages.length} messages</Text>
          </View>
          <TouchableOpacity
            style={styles.chatRefreshBtn}
            onPress={() => selectedGroup && fetchGroupMessages(selectedGroup.group_id)}
          >
            <Ionicons name="refresh" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {/* Messages */}
          {loadingMessages ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator size="large" color={selectedGroup?.color || COLORS.accentBlue} />
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubbles-outline" size={56} color="#CBD5E1" />
              <Text style={styles.emptyChatTitle}>No messages yet</Text>
              <Text style={styles.emptyChatText}>Be the first to start the conversation!</Text>
            </View>
          ) : (
            <FlatList
              data={messages.filter((m) => !m.is_reply)}
              keyExtractor={(item) => item._id}
              contentContainerStyle={styles.messagesList}
              renderItem={({ item }) => (
                <View style={styles.msgCard}>
                  <View style={styles.msgHeader}>
                    <View style={[styles.msgAvatar, { backgroundColor: selectedGroup?.color || '#3B82F6' }]}>
                      <Text style={styles.msgAvatarText}>
                        {(item.user_name || 'A').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.msgNameRow}>
                        <Text style={styles.msgName}>{item.user_name}</Text>
                        {item.user_role === 'admin' && (
                          <View style={styles.adminBadge}>
                            <Text style={styles.adminText}>ADMIN</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.msgTime}>{getTimeAgo(item.created_at)}</Text>
                    </View>
                  </View>
                  <Text style={styles.msgText}>{item.text}</Text>
                  <View style={styles.msgFooter}>
                    <TouchableOpacity style={styles.msgAction} onPress={() => likeMessage(item._id)}>
                      <Ionicons name="heart-outline" size={18} color="#EF4444" />
                      <Text style={styles.msgActionText}>{item.likes}</Text>
                    </TouchableOpacity>
                    <View style={styles.msgAction}>
                      <Ionicons name="chatbubble-outline" size={18} color="#64748B" />
                      <Text style={styles.msgActionText}>{item.replies}</Text>
                    </View>
                  </View>
                </View>
              )}
            />
          )}

          {/* Input */}
          <View style={styles.inputBar}>
            <TextInput
              style={styles.chatInput}
              placeholder="Write a message..."
              placeholderTextColor="#94A3B8"
              value={newMessage}
              onChangeText={setNewMessage}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                newMessage.trim() && { backgroundColor: selectedGroup?.color || COLORS.accentGreen },
              ]}
              onPress={sendMessage}
              disabled={!newMessage.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="send" size={20} color={newMessage.trim() ? '#FFF' : '#94A3B8'} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );

  // Main Groups List View
  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#1E40AF', '#7C3AED']} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Driver Community</Text>
          <Text style={styles.headerSub}>Connect with fellow NEXRYDE drivers</Text>
        </View>
        <View style={{ width: 44 }} />
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={COLORS.accentBlue} />
            <Text style={styles.loadingText}>Loading groups...</Text>
          </View>
        ) : (
          <>
            {/* Official Groups */}
            <Text style={styles.sectionTitle}>Official Channels</Text>
            {groups
              .filter((g) => g.is_official)
              .map((group) => (
                <TouchableOpacity key={group.group_id} style={styles.groupCard} onPress={() => openGroup(group)}>
                  <View style={[styles.groupIcon, { backgroundColor: group.color + '20' }]}>
                    <Ionicons name={(group.icon || 'chatbubbles') as any} size={28} color={group.color} />
                  </View>
                  <View style={styles.groupInfo}>
                    <View style={styles.groupNameRow}>
                      <Text style={styles.groupName}>{group.name}</Text>
                      <Ionicons name="checkmark-circle" size={16} color="#0EA5E9" />
                    </View>
                    <Text style={styles.groupDesc}>{group.description}</Text>
                    <View style={styles.groupMeta}>
                      <Ionicons name="chatbubble" size={12} color="#94A3B8" />
                      <Text style={styles.groupMetaText}>{group.recent_messages} today</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
                </TouchableOpacity>
              ))}

            {/* City Groups */}
            <Text style={styles.sectionTitle}>City Groups (16 Cities)</Text>
            {groups
              .filter((g) => g.group_id.includes('drivers') || g.group_id.includes('harcourt'))
              .map((group) => (
                <TouchableOpacity key={group.group_id} style={styles.groupCard} onPress={() => openGroup(group)}>
                  <View style={[styles.groupIcon, { backgroundColor: group.color + '20' }]}>
                    <Ionicons name={(group.icon || 'car') as any} size={28} color={group.color} />
                  </View>
                  <View style={styles.groupInfo}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <Text style={styles.groupDesc}>{group.description}</Text>
                    <View style={styles.groupMeta}>
                      <Ionicons name="chatbubble" size={12} color="#94A3B8" />
                      <Text style={styles.groupMetaText}>{group.recent_messages} today</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
                </TouchableOpacity>
              ))}

            {/* Topic Groups */}
            <Text style={styles.sectionTitle}>Discussion Topics</Text>
            {groups
              .filter((g) => !g.is_official && !g.group_id.includes('drivers') && !g.group_id.includes('harcourt'))
              .map((group) => (
                <TouchableOpacity key={group.group_id} style={styles.groupCard} onPress={() => openGroup(group)}>
                  <View style={[styles.groupIcon, { backgroundColor: group.color + '20' }]}>
                    <Ionicons name={(group.icon || 'chatbubbles') as any} size={28} color={group.color} />
                  </View>
                  <View style={styles.groupInfo}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <Text style={styles.groupDesc}>{group.description}</Text>
                    <View style={styles.groupMeta}>
                      <Ionicons name="chatbubble" size={12} color="#94A3B8" />
                      <Text style={styles.groupMetaText}>{group.recent_messages} today</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
                </TouchableOpacity>
              ))}

            <View style={{ height: 80 }} />
          </>
        )}
      </ScrollView>

      {/* Group Chat Modal */}
      {renderGroupChat()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xl,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  backButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#FFF', textAlign: 'center' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 2 },
  content: { padding: SPACING.lg },
  loadingCenter: { alignItems: 'center', paddingTop: 60 },
  loadingText: { marginTop: SPACING.md, fontSize: 16, color: '#64748B', fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: SPACING.md, marginTop: SPACING.md },
  groupCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16,
    padding: SPACING.md, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  groupIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  groupInfo: { flex: 1, marginLeft: SPACING.md },
  groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  groupDesc: { fontSize: 13, color: '#64748B', marginTop: 2 },
  groupMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  groupMetaText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  // Chat modal styles
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  chatBackBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.md,
  },
  chatTitle: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  chatSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  chatRefreshBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyChatTitle: { fontSize: 18, fontWeight: '800', color: '#64748B', marginTop: SPACING.md },
  emptyChatText: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
  messagesList: { padding: SPACING.md },
  msgCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: SPACING.md, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  msgHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  msgAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm },
  msgAvatarText: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  msgNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  msgName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  adminBadge: { backgroundColor: '#DBEAFE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  adminText: { fontSize: 10, fontWeight: '800', color: '#1D4ED8' },
  msgTime: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  msgText: { fontSize: 15, color: '#334155', lineHeight: 22 },
  msgFooter: { flexDirection: 'row', gap: SPACING.lg, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  msgAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  msgActionText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', padding: SPACING.sm,
    backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },
  chatInput: {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 15, color: '#0F172A', maxHeight: 100, marginRight: 8,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center',
  },
});
