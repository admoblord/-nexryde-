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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  is_pinned?: boolean;
  parent_id?: string;
  created_at: string;
}

interface Poll {
  poll_id: string;
  group_id: string;
  user_name: string;
  question: string;
  options: { text: string; votes: number }[];
  total_votes: number;
  is_active: boolean;
  expires_at: string;
}

interface CommunityEvent {
  event_id: string;
  group_id: string;
  title: string;
  description: string;
  event_type: string;
  location: string;
  date: string;
  time: string;
  created_by_name: string;
  rsvp_count: number;
  is_featured: boolean;
}

export default function DriverCommunityScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<GroupMessage[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [activeTab, setActiveTab] = useState<'groups' | 'events'>('groups');
  const [chatTab, setChatTab] = useState<'chat' | 'polls' | 'pinned'>('chat');
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  useEffect(() => {
    fetchGroups();
    fetchEvents();
  }, []);

  const fetchGroups = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/community/groups`);
      const data = await res.json();
      if (data.success) setGroups(data.groups || []);
    } catch (e) {
      if (__DEV__) console.warn('Fetch groups error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/community/events`);
      const data = await res.json();
      if (data.success) setEvents(data.events || []);
    } catch (e) {
      if (__DEV__) console.warn('Fetch events error', e);
    }
  };

  const fetchGroupMessages = async (groupId: string) => {
    setLoadingMessages(true);
    try {
      const [msgRes, pinnedRes, pollRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/community/groups/${groupId}/messages?limit=50`),
        fetch(`${BACKEND_URL}/api/community/groups/${groupId}/pinned`),
        fetch(`${BACKEND_URL}/api/community/groups/${groupId}/polls`),
      ]);
      const [msgData, pinnedData, pollData] = await Promise.all([
        msgRes.json(), pinnedRes.json(), pollRes.json(),
      ]);
      if (msgData.success) setMessages(msgData.messages || []);
      if (pinnedData.success) setPinnedMessages(pinnedData.pinned_messages || []);
      if (pollData.success) setPolls(pollData.polls || []);
    } catch (e) {
      if (__DEV__) console.warn('Fetch messages error', e);
    } finally {
      setLoadingMessages(false);
    }
  };

  const openGroup = (group: CommunityGroup) => {
    setSelectedGroup(group);
    setChatTab('chat');
    fetchGroupMessages(group.group_id);
  };

  const closeGroup = () => {
    setSelectedGroup(null);
    setMessages([]);
    setPinnedMessages([]);
    setPolls([]);
    setNewMessage('');
    setShowPollCreator(false);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedGroup) return;
    setSending(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/community/groups/${selectedGroup.group_id}/messages`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
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
      if (__DEV__) console.warn('Like error', e);
    }
  };

  const voteOnPoll = async (pollId: string, optionIndex: number) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/community/polls/${pollId}/vote`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ user_id: user?.id || 'anonymous', option_index: optionIndex }),
      });
      const data = await res.json();
      if (data.success) {
        setPolls((prev) => prev.map((p) => {
          if (p.poll_id !== pollId) return p;
          const newOptions = [...p.options];
          newOptions[optionIndex] = { ...newOptions[optionIndex], votes: newOptions[optionIndex].votes + 1 };
          return { ...p, options: newOptions, total_votes: p.total_votes + 1 };
        }));
        Alert.alert('Voted!', 'Your vote has been recorded');
      } else {
        Alert.alert('Oops', data.detail || 'Could not vote');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not vote');
    }
  };

  const createPoll = async () => {
    if (!pollQuestion.trim() || !selectedGroup) return;
    const validOptions = pollOptions.filter(o => o.trim());
    if (validOptions.length < 2) {
      Alert.alert('Error', 'Need at least 2 options');
      return;
    }
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/community/groups/${selectedGroup.group_id}/polls`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            user_id: user?.id || 'anonymous',
            user_name: user?.name || 'Anonymous Driver',
            question: pollQuestion.trim(),
            options: validOptions,
            duration_hours: 24,
          }),
        }
      );
      const data = await res.json();
      if (data.success) {
        setPolls((prev) => [data.poll, ...prev]);
        setShowPollCreator(false);
        setPollQuestion('');
        setPollOptions(['', '']);
        Alert.alert('Poll Created!', 'Your poll is now live');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not create poll');
    }
  };

  const rsvpEvent = async (eventId: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/community/events/${eventId}/rsvp`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ user_id: user?.id || 'anonymous' }),
      });
      const data = await res.json();
      if (data.success) {
        setEvents((prev) => prev.map((e) => {
          if (e.event_id !== eventId) return e;
          return { ...e, rsvp_count: data.action === 'added' ? e.rsvp_count + 1 : e.rsvp_count - 1 };
        }));
        Alert.alert(data.action === 'added' ? 'RSVP Confirmed!' : 'RSVP Removed', data.message);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not RSVP');
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGroups();
    fetchEvents();
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

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'meetup': return 'people';
      case 'promotion': return 'gift';
      case 'training': return 'school';
      default: return 'megaphone';
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'meetup': return '#8B5CF6';
      case 'promotion': return '#EF4444';
      case 'training': return '#0EA5E9';
      default: return '#F59E0B';
    }
  };

  // Poll Card Component
  const renderPollCard = (poll: Poll) => {
    const maxVotes = Math.max(...poll.options.map(o => o.votes), 1);
    return (
      <View key={poll.poll_id} style={styles.pollCard}>
        <View style={styles.pollHeader}>
          <Ionicons name="stats-chart" size={20} color="#8B5CF6" />
          <Text style={styles.pollLabel}>POLL</Text>
          {poll.is_active && <View style={styles.activeDot} />}
        </View>
        <Text style={styles.pollQuestion}>{poll.question}</Text>
        <Text style={styles.pollBy}>by {poll.user_name}</Text>
        {poll.options.map((opt, idx) => {
          const pct = poll.total_votes > 0 ? Math.round((opt.votes / poll.total_votes) * 100) : 0;
          return (
            <TouchableOpacity
              key={idx}
              style={styles.pollOption}
              onPress={() => poll.is_active && voteOnPoll(poll.poll_id, idx)}
              disabled={!poll.is_active}
            >
              <View style={[styles.pollBar, { width: `${pct}%`, backgroundColor: pct === Math.round((maxVotes / poll.total_votes) * 100) ? '#8B5CF620' : '#F1F5F9' }]} />
              <View style={styles.pollOptionContent}>
                <Text style={styles.pollOptionText}>{opt.text}</Text>
                <Text style={styles.pollPct}>{pct}%</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <Text style={styles.pollVotes}>{poll.total_votes} votes</Text>
      </View>
    );
  };

  // Event Card Component
  const renderEventCard = (event: CommunityEvent) => (
    <View key={event.event_id} style={styles.eventCard}>
      {event.is_featured && (
        <LinearGradient colors={['#F59E0B', '#EF4444']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.featuredBadge}>
          <Ionicons name="star" size={10} color="#FFF" />
          <Text style={styles.featuredText}>FEATURED</Text>
        </LinearGradient>
      )}
      <View style={styles.eventHeader}>
        <View style={[styles.eventIcon, { backgroundColor: getEventColor(event.event_type) + '20' }]}>
          <Ionicons name={getEventIcon(event.event_type) as any} size={24} color={getEventColor(event.event_type)} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eventType}>{event.event_type.toUpperCase()}</Text>
          <Text style={styles.eventTitle}>{event.title}</Text>
        </View>
      </View>
      <Text style={styles.eventDesc}>{event.description}</Text>
      <View style={styles.eventDetails}>
        <View style={styles.eventDetail}>
          <Ionicons name="calendar-outline" size={14} color="#64748B" />
          <Text style={styles.eventDetailText}>{event.date}</Text>
        </View>
        <View style={styles.eventDetail}>
          <Ionicons name="time-outline" size={14} color="#64748B" />
          <Text style={styles.eventDetailText}>{event.time}</Text>
        </View>
        <View style={styles.eventDetail}>
          <Ionicons name="location-outline" size={14} color="#64748B" />
          <Text style={styles.eventDetailText}>{event.location}</Text>
        </View>
      </View>
      <View style={styles.eventFooter}>
        <Text style={styles.eventRsvpCount}>{event.rsvp_count} attending</Text>
        <TouchableOpacity
          style={styles.rsvpBtn}
          onPress={() => rsvpEvent(event.event_id)}
        >
          <Ionicons name="checkmark-circle" size={16} color="#FFF" />
          <Text style={styles.rsvpBtnText}>RSVP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Poll Creator Modal
  const renderPollCreator = () => (
    <Modal visible={showPollCreator} animationType="slide" transparent>
      <View style={styles.pollModalOverlay}>
        <View style={styles.pollModal}>
          <View style={styles.pollModalHeader}>
            <Text style={styles.pollModalTitle}>Create Poll</Text>
            <TouchableOpacity onPress={() => setShowPollCreator(false)}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.pollInput}
            placeholder="Ask a question..."
            placeholderTextColor="#94A3B8"
            value={pollQuestion}
            onChangeText={setPollQuestion}
          />
          {pollOptions.map((opt, idx) => (
            <View key={idx} style={styles.pollOptionInput}>
              <TextInput
                style={[styles.pollInput, { flex: 1 }]}
                placeholder={`Option ${idx + 1}`}
                placeholderTextColor="#94A3B8"
                value={opt}
                onChangeText={(text) => {
                  const newOpts = [...pollOptions];
                  newOpts[idx] = text;
                  setPollOptions(newOpts);
                }}
              />
              {idx >= 2 && (
                <TouchableOpacity onPress={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}>
                  <Ionicons name="close-circle" size={22} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {pollOptions.length < 6 && (
            <TouchableOpacity style={styles.addOptionBtn} onPress={() => setPollOptions([...pollOptions, ''])}>
              <Ionicons name="add-circle-outline" size={20} color="#3B82F6" />
              <Text style={styles.addOptionText}>Add Option</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.createPollBtn} onPress={createPoll}>
            <Text style={styles.createPollBtnText}>Create Poll</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

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

        {/* Chat Tabs */}
        <View style={styles.chatTabs}>
          {(['chat', 'polls', 'pinned'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.chatTabBtn, chatTab === tab && { borderBottomColor: selectedGroup?.color || '#3B82F6', borderBottomWidth: 2 }]}
              onPress={() => setChatTab(tab)}
            >
              <Ionicons
                name={tab === 'chat' ? 'chatbubbles' : tab === 'polls' ? 'stats-chart' : 'pin'}
                size={16}
                color={chatTab === tab ? (selectedGroup?.color || '#3B82F6') : '#94A3B8'}
              />
              <Text style={[styles.chatTabText, chatTab === tab && { color: selectedGroup?.color || '#3B82F6' }]}>
                {tab === 'chat' ? 'Chat' : tab === 'polls' ? `Polls (${polls.length})` : `Pinned (${pinnedMessages.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {loadingMessages ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator size="large" color={selectedGroup?.color || COLORS.accentBlue} />
            </View>
          ) : chatTab === 'polls' ? (
            /* Polls Tab */
            <ScrollView contentContainerStyle={styles.messagesList}>
              <TouchableOpacity style={styles.newPollBtn} onPress={() => setShowPollCreator(true)}>
                <Ionicons name="add-circle" size={20} color="#8B5CF6" />
                <Text style={styles.newPollBtnText}>Create New Poll</Text>
              </TouchableOpacity>
              {polls.length === 0 ? (
                <View style={styles.emptyChat}>
                  <Ionicons name="stats-chart-outline" size={56} color="#CBD5E1" />
                  <Text style={styles.emptyChatTitle}>No polls yet</Text>
                  <Text style={styles.emptyChatText}>Create the first poll to get opinions!</Text>
                </View>
              ) : (
                polls.map(renderPollCard)
              )}
            </ScrollView>
          ) : chatTab === 'pinned' ? (
            /* Pinned Tab */
            <ScrollView contentContainerStyle={styles.messagesList}>
              {pinnedMessages.length === 0 ? (
                <View style={styles.emptyChat}>
                  <Ionicons name="pin-outline" size={56} color="#CBD5E1" />
                  <Text style={styles.emptyChatTitle}>No pinned messages</Text>
                  <Text style={styles.emptyChatText}>Important messages will appear here</Text>
                </View>
              ) : (
                pinnedMessages.map((item) => (
                  <View key={item._id} style={[styles.msgCard, styles.pinnedMsgCard]}>
                    <View style={styles.pinnedBadge}>
                      <Ionicons name="pin" size={12} color="#F59E0B" />
                      <Text style={styles.pinnedBadgeText}>PINNED</Text>
                    </View>
                    <View style={styles.msgHeader}>
                      <View style={[styles.msgAvatar, { backgroundColor: selectedGroup?.color || '#3B82F6' }]}>
                        <Text style={styles.msgAvatarText}>{(item.user_name || 'A').charAt(0).toUpperCase()}</Text>
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
                  </View>
                ))
              )}
            </ScrollView>
          ) : (
            /* Chat Tab */
            <>
              {messages.length === 0 ? (
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
                    <View style={[styles.msgCard, item.is_pinned && styles.pinnedMsgCard]}>
                      {item.is_pinned && (
                        <View style={styles.pinnedBadge}>
                          <Ionicons name="pin" size={12} color="#F59E0B" />
                          <Text style={styles.pinnedBadgeText}>PINNED</Text>
                        </View>
                      )}
                      <View style={styles.msgHeader}>
                        <View style={[styles.msgAvatar, { backgroundColor: selectedGroup?.color || '#3B82F6' }]}>
                          <Text style={styles.msgAvatarText}>{(item.user_name || 'A').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.msgNameRow}>
                            <Text style={styles.msgName}>{item.user_name}</Text>
                            {item.user_role === 'admin' && (
                              <View style={styles.adminBadge}><Text style={styles.adminText}>ADMIN</Text></View>
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
            </>
          )}

          {/* Input - only show on chat tab */}
          {chatTab === 'chat' && (
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
                style={[styles.sendBtn, newMessage.trim() && { backgroundColor: selectedGroup?.color || COLORS.accentGreen }]}
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
          )}
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

      {/* Main Tabs: Groups / Events */}
      <View style={styles.mainTabs}>
        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'groups' && styles.mainTabActive]}
          onPress={() => setActiveTab('groups')}
        >
          <Ionicons name="people" size={18} color={activeTab === 'groups' ? '#1E40AF' : '#94A3B8'} />
          <Text style={[styles.mainTabText, activeTab === 'groups' && styles.mainTabTextActive]}>Groups</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'events' && styles.mainTabActive]}
          onPress={() => setActiveTab('events')}
        >
          <Ionicons name="calendar" size={18} color={activeTab === 'events' ? '#1E40AF' : '#94A3B8'} />
          <Text style={[styles.mainTabText, activeTab === 'events' && styles.mainTabTextActive]}>
            Events ({events.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={COLORS.accentBlue} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : activeTab === 'events' ? (
          /* Events Tab */
          <>
            {events.filter(e => e.is_featured).length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Featured Events</Text>
                {events.filter(e => e.is_featured).map(renderEventCard)}
              </>
            )}
            <Text style={styles.sectionTitle}>All Events</Text>
            {events.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyStateTitle}>No events yet</Text>
                <Text style={styles.emptyStateText}>Community events will appear here</Text>
              </View>
            ) : (
              events.filter(e => !e.is_featured).map(renderEventCard)
            )}
          </>
        ) : (
          /* Groups Tab */
          <>
            {/* Official Groups */}
            <Text style={styles.sectionTitle}>Official Channels</Text>
            {groups.filter((g) => g.is_official).map((group) => (
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
            <Text style={styles.sectionTitle}>City Groups</Text>
            {groups.filter((g) => g.group_id.includes('drivers') || g.group_id.includes('harcourt')).map((group) => (
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
            {groups.filter((g) => !g.is_official && !g.group_id.includes('drivers') && !g.group_id.includes('harcourt')).map((group) => (
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
      {/* Poll Creator Modal */}
      {renderPollCreator()}
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
  // Main Tabs
  mainTabs: {
    flexDirection: 'row', backgroundColor: '#FFF', paddingHorizontal: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  mainTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 6,
  },
  mainTabActive: { borderBottomWidth: 2, borderBottomColor: '#1E40AF' },
  mainTabText: { fontSize: 14, fontWeight: '700', color: '#94A3B8' },
  mainTabTextActive: { color: '#1E40AF' },
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
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  chatBackBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md,
  },
  chatTitle: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  chatSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  chatRefreshBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  // Chat Tabs
  chatTabs: {
    flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  chatTabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 4, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  chatTabText: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyChatTitle: { fontSize: 18, fontWeight: '800', color: '#64748B', marginTop: SPACING.md },
  emptyChatText: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
  messagesList: { padding: SPACING.md },
  msgCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: SPACING.md, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  pinnedMsgCard: { borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  pinnedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8,
  },
  pinnedBadgeText: { fontSize: 10, fontWeight: '800', color: '#F59E0B' },
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
  // Poll styles
  newPollBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#EDE9FE', borderRadius: 12, padding: 14, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: '#8B5CF620', borderStyle: 'dashed',
  },
  newPollBtnText: { fontSize: 14, fontWeight: '700', color: '#8B5CF6' },
  pollCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: SPACING.md, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: '#8B5CF6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  pollHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  pollLabel: { fontSize: 11, fontWeight: '800', color: '#8B5CF6', letterSpacing: 1 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  pollQuestion: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  pollBy: { fontSize: 12, color: '#94A3B8', marginBottom: 12 },
  pollOption: {
    borderRadius: 10, marginBottom: 6, overflow: 'hidden', backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  pollBar: {
    position: 'absolute', top: 0, left: 0, bottom: 0, borderRadius: 10,
  },
  pollOptionContent: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  pollOptionText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  pollPct: { fontSize: 13, fontWeight: '800', color: '#64748B' },
  pollVotes: { fontSize: 12, color: '#94A3B8', marginTop: 8, fontWeight: '600' },
  // Poll Creator Modal
  pollModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  pollModal: {
    backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.lg, maxHeight: '80%',
  },
  pollModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md,
  },
  pollModalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  pollInput: {
    backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, color: '#0F172A', marginBottom: 10,
  },
  pollOptionInput: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addOptionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8,
  },
  addOptionText: { fontSize: 14, fontWeight: '600', color: '#3B82F6' },
  createPollBtn: {
    backgroundColor: '#8B5CF6', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: SPACING.md,
  },
  createPollBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  // Event styles
  eventCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: SPACING.md, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  featuredBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 8,
  },
  featuredText: { fontSize: 10, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  eventHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  eventIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  eventType: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1, marginBottom: 2 },
  eventTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  eventDesc: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 12 },
  eventDetails: { gap: 6, marginBottom: 12 },
  eventDetail: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventDetailText: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  eventFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  eventRsvpCount: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  rsvpBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#22C55E',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  rsvpBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyStateTitle: { fontSize: 18, fontWeight: '800', color: '#64748B', marginTop: 12 },
  emptyStateText: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
});
