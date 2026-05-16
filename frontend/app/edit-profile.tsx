import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { updateUser } from '@/src/services/api';
import { saveUserSession } from '@/utils/authStorage';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useRequireUserOrLogin } from '@/src/hooks/useRequireUserOrLogin';
import { AuthLoadingGate } from '@/src/components/AuthLoadingGate';

export default function EditProfileScreen() {
  const router = useRouter();
  const authed = useRequireUserOrLogin();
  const { user, setUser } = useAppStore();
  const { userId, canCallAuthedApi } = useAuthedUserId();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [profileImage, setProfileImage] = useState<string | null>(user?.profile_image || null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!userId || !canCallAuthedApi || !user) return;
    setName(user.name || '');
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setProfileImage(user.profile_image || null);
  }, [userId, canCallAuthedApi, user]);

  const pickImage = () => {
    Alert.alert('Change Photo', 'Choose photo source', [
      { text: 'Camera', onPress: openCamera },
      { text: 'Gallery', onPress: openGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow camera access to take a profile photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const imageData = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setProfileImage(imageData);
      }
    } catch {
      Alert.alert('Error', 'Could not open camera.');
    }
  };

  const openGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow gallery access to choose a profile photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const imageData = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setProfileImage(imageData);
      }
    } catch {
      Alert.alert('Error', 'Could not open gallery.');
    }
  };

  const handleSave = async () => {
    if (!userId || !canCallAuthedApi) {
      Alert.alert('Error', 'No user session found. Please login again.');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        profile_image: profileImage || undefined,
      };
      const response = await updateUser(userId, payload);
      const updatedUser = response?.data || { ...user, ...payload };
      setUser(updatedUser);
      await saveUserSession(updatedUser);
      Alert.alert('Success', 'Profile updated successfully!');
      router.back();
    } catch (error: any) {
      const message = error?.response?.data?.detail || 'Could not save profile. Please try again.';
      Alert.alert('Update failed', message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!authed) {
    return <AuthLoadingGate />;
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.gray900} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={48} color={COLORS.gray400} />
              )}
            </View>
            <TouchableOpacity style={styles.changePhotoButton} onPress={pickImage}>
              <Ionicons name="camera" size={20} color={COLORS.accentGreen} />
              <Text style={styles.changePhotoText}>Change Photo</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color={COLORS.gray500} />
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter your name"
                placeholderTextColor={COLORS.gray400}
              />
            </View>

            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={COLORS.gray500} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor={COLORS.gray400}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.label}>Phone Number</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="call-outline" size={20} color={COLORS.gray500} />
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter your phone"
                placeholderTextColor={COLORS.gray400}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  backButton: { padding: SPACING.xs },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.gray900 },
  placeholder: { width: 40 },
  content: { flex: 1 },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  changePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  changePhotoText: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.accentGreen },
  formSection: {
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray300,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.white,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.gray900,
    paddingVertical: SPACING.md,
    paddingLeft: SPACING.sm,
  },
  saveButton: {
    backgroundColor: COLORS.accentGreen,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    marginBottom: SPACING.xxl,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  saveButtonText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white },
});