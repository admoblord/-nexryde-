import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useThemeColors } from '@/src/constants/theme';
import { BRAND, RADIUS, SPACING, SURFACE, TYPOGRAPHY } from '@/src/constants/designSystem';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { useAppStore } from '@/src/store/appStore';
import { updateUser } from '@/src/services/api';
import { saveUserSession } from '@/utils/authStorage';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useRequireUserOrLogin } from '@/src/hooks/useRequireUserOrLogin';

export default function EditProfileScreen() {
  const router = useRouter();
  const authed = useRequireUserOrLogin();
  const flow = useFlowLayout();
  const { colors, isDark } = useThemeColors();
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
    return null;
  }

  const initial = (name || user?.name || 'N').trim().charAt(0).toUpperCase() || 'N';
  const cardBg = isDark ? SURFACE.cardDark : colors.card;
  const border = isDark ? SURFACE.hairline : colors.border;
  const inputBg = isDark ? SURFACE.tile : colors.surface;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: isDark ? BRAND.bgDeep : colors.background }]} edges={['top']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={isDark ? BRAND.bgDeep : colors.background} />

      <View style={[styles.header, { borderBottomColor: border, paddingHorizontal: flow.padH }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: isDark ? SURFACE.tile : colors.card, borderColor: border }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: flow.padH,
            maxWidth: flow.maxContentWidth,
            alignSelf: 'center',
            width: '100%',
            paddingBottom: SPACING.xxl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={isDark ? [BRAND.bgDeep, BRAND.bgCard, BRAND.bgDeep] : [colors.background, colors.card, colors.background]}
          style={styles.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        >
          <View style={styles.heroGlow} />
          <LinearGradient
            colors={[BRAND.primary, BRAND.info]}
            style={styles.avatarRing}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <TouchableOpacity style={styles.avatarInner} onPress={pickImage} activeOpacity={0.85}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatarImg} />
              ) : (
                <LinearGradient colors={[BRAND.bgElevated, BRAND.bgDeep]} style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>{initial}</Text>
                </LinearGradient>
              )}
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={11} color={BRAND.textInverse} />
              </View>
            </TouchableOpacity>
          </LinearGradient>
          <TouchableOpacity onPress={pickImage} accessibilityRole="button" accessibilityLabel="Change photo">
            <Text style={styles.changePhotoText}>Change photo</Text>
          </TouchableOpacity>
        </LinearGradient>

        <View style={[styles.formCard, { backgroundColor: cardBg, borderColor: border }]}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Contact</Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Full name</Text>
          <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: border }]}>
            <Ionicons name="person-outline" size={18} color={BRAND.primary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Email address</Text>
          <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: border }]}>
            <Ionicons name="mail-outline" size={18} color={BRAND.info} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Phone number</Text>
          <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: border }]}>
            <Ionicons name="call-outline" size={18} color={BRAND.warning} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={phone}
              onChangeText={setPhone}
              placeholder="Enter your phone"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Save changes"
        >
          <LinearGradient colors={[BRAND.primaryDark, BRAND.primary]} style={styles.saveGrad}>
            {isSaving ? (
              <ActivityIndicator color={BRAND.textInverse} />
            ) : (
              <Text style={styles.saveText}>Save changes</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  scroll: {
    paddingTop: SPACING.sm,
    gap: SPACING.stack,
  },
  hero: {
    alignItems: 'center',
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute',
    top: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: BRAND.primaryMuted,
  },
  avatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
    marginBottom: SPACING.sm,
  },
  avatarInner: {
    width: 98,
    height: 98,
    borderRadius: 49,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImg: { width: 98, height: 98, borderRadius: 49 },
  avatarFallback: {
    width: 98,
    height: 98,
    borderRadius: 49,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: '900',
    color: BRAND.textPrimary,
    letterSpacing: -1,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BRAND.info,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BRAND.bgDeep,
  },
  changePhotoText: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.primary,
  },
  formCard: {
    borderRadius: RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md,
    paddingTop: SPACING.stack,
  },
  sectionLabel: {
    ...TYPOGRAPHY.label,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: SPACING.stack,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.stack,
    gap: SPACING.inline,
    minHeight: 52,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: SPACING.stack,
  },
  saveBtn: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginTop: SPACING.sm,
  },
  saveGrad: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.textInverse,
  },
});
