import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';
import { theme } from '@/src/constants/theme';

export default function CreatePostScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState('text');
  const [loading, setLoading] = useState(false);

  const postTypes = [
    { id: 'text', label: 'General', icon: 'chatbubble' },
    { id: 'tip', label: 'Tip', icon: 'bulb' },
    { id: 'question', label: 'Question', icon: 'help-circle' },
    { id: 'achievement', label: 'Achievement', icon: 'trophy' },
  ];

  const handleCreatePost = async () => {
    if (!content.trim()) {
      Alert.alert('Error', 'Please write something!');
      return;
    }

    setLoading(true);
    try {
      await api.post(`/community/posts/create?driver_id=${user?.id}`, {
        content: content.trim(),
        post_type: postType,
        images: [],
        tags: [],
      });

      Alert.alert('Success', 'Post created successfully!');
      router.back();
    } catch (error) {
      console.error('Error creating post:', error);
      Alert.alert('Error', 'Failed to create post. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Post</Text>
        <TouchableOpacity
          onPress={handleCreatePost}
          disabled={loading || !content.trim()}
        >
          <Text
            style={[
              styles.postButton,
              (loading || !content.trim()) && styles.postButtonDisabled,
            ]}
          >
            {loading ? 'Posting...' : 'Post'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Post Type Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Post Type</Text>
          <View style={styles.typeSelector}>
            {postTypes.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.typeOption,
                  postType === type.id && styles.typeOptionActive,
                ]}
                onPress={() => setPostType(type.id)}
              >
                <Ionicons
                  name={type.icon as any}
                  size={20}
                  color={postType === type.id ? '#fff' : theme.colors.primary}
                />
                <Text
                  style={[
                    styles.typeLabel,
                    postType === type.id && styles.typeLabelActive,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Content Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What's on your mind?</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Share something with fellow drivers..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={10}
            value={content}
            onChangeText={setContent}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{content.length} / 1000</Text>
        </View>

        {/* Tips */}
        <View style={styles.tipsCard}>
          <Ionicons name="information-circle" size={20} color={theme.colors.primary} />
          <Text style={styles.tipsText}>
            Share your experiences, tips, questions, or achievements with the NexRyde community!
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  postButton: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  postButtonDisabled: {
    color: '#ccc',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: '#fff',
  },
  typeOptionActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
    marginLeft: 6,
  },
  typeLabelActive: {
    color: '#fff',
  },
  textInput: {
    fontSize: 16,
    color: '#000',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    minHeight: 200,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 8,
  },
  tipsCard: {
    flexDirection: 'row',
    backgroundColor: `${theme.colors.primary}10`,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  tipsText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    lineHeight: 20,
  },
});
