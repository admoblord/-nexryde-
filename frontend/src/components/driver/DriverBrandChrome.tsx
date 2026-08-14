import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { HEADER_BLUR_DEFAULT, HEADER_BLUR_INCOMING } from '@/src/components/driver/driverDockTheme';
import { BRAND } from '@/src/constants/designSystem';
import { NexrydeMark } from '@/src/components/brand/NexrydeMark';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';

export type DriverBrandHeaderVariant = 'default' | 'incoming' | 'trip-light';

function DriverHeaderAvatar({
  uri,
  onPress,
  size = 40,
  onlineDot,
}: {
  uri?: string | null;
  onPress?: () => void;
  size?: number;
  onlineDot?: boolean;
}) {
  if (!onPress && !uri) return null;
  const body = (
    <TripProfileAvatar
      size={size}
      uri={uri}
      borderColor="#FFFFFF"
      borderWidth={2}
      showOnlineDot={onlineDot}
      onlineDotColor="#22C55E"
      accessibilityLabel="Your driver profile photo"
    />
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel="Open driver profile"
    >
      {body}
    </TouchableOpacity>
  );
}

/** Matches rider booking chrome — app icon, NEXRYDE wordmark, driver photo (Uber-style). */
export function DriverBrandHeaderRow({
  topInset,
  variant = 'default',
  onMenuPress,
  onInboxPress,
  inboxUnread = 0,
  profileImageUri,
  onProfilePress,
  showOnlineDot,
}: {
  topInset: number;
  variant?: DriverBrandHeaderVariant;
  /** Incoming ride: hamburger opens hub */
  onMenuPress?: () => void;
  /** Incoming ride: opens notifications / inbox */
  onInboxPress?: () => void;
  inboxUnread?: number;
  /** Driver's own portrait — always visible like Uber home. */
  profileImageUri?: string | null;
  onProfilePress?: () => void;
  showOnlineDot?: boolean;
}) {
  if (variant === 'incoming' && onMenuPress && onInboxPress) {
    return (
      <View style={incomingStyles.outer}>
        {Platform.OS !== 'web' ? (
          <BlurView intensity={HEADER_BLUR_INCOMING} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(6,11,22,0.96)' }]} />
        )}
        <LinearGradient
          colors={['rgba(52,245,184,0.12)', 'rgba(52,245,184,0.02)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={incomingStyles.sheen}
          pointerEvents="none"
        />
        <View style={[incomingStyles.inner, { paddingTop: topInset + 8 }]}>
          <TouchableOpacity
            style={incomingStyles.iconBtnOuter}
            onPress={onMenuPress}
            activeOpacity={0.78}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Menu"
          >
            <LinearGradient
              colors={['rgba(51,65,85,0.55)', 'rgba(15,23,42,0.92)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={incomingStyles.iconBtnGrad}
            >
              <Ionicons name="menu" size={21} color="#F1F5F9" />
            </LinearGradient>
          </TouchableOpacity>
          <View style={incomingStyles.wordmark} pointerEvents="none">
            <Text style={incomingStyles.brandNex}>NEX</Text>
            <Text style={incomingStyles.brandR}>R</Text>
            <Text style={incomingStyles.brandYde}>YDE</Text>
          </View>
          <View style={incomingStyles.rightCluster}>
            <DriverHeaderAvatar
              uri={profileImageUri}
              onPress={onProfilePress}
              size={40}
              onlineDot={showOnlineDot}
            />
            <TouchableOpacity
              style={incomingStyles.iconBtnOuter}
              onPress={onInboxPress}
              activeOpacity={0.78}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Messages and notifications"
            >
              <LinearGradient
                colors={['rgba(30,64,175,0.45)', 'rgba(15,23,42,0.95)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={incomingStyles.iconBtnGrad}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={19} color="#BFDBFE" />
              </LinearGradient>
              {inboxUnread > 0 ? (
                <View style={incomingStyles.inboxBadge}>
                  <Text style={incomingStyles.inboxBadgeTxt}>
                    {inboxUnread > 99 ? '99+' : inboxUnread}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>
        <View style={incomingStyles.hairline} pointerEvents="none" />
      </View>
    );
  }

  if (variant === 'trip-light') {
    return (
      <View style={lightStyles.outer}>
        <View style={[lightStyles.wrap, { paddingTop: topInset + 8 }]}>
          {onMenuPress ? (
            <TouchableOpacity
              style={lightStyles.menuBtn}
              onPress={onMenuPress}
              activeOpacity={0.82}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Menu"
            >
              <Ionicons name="menu" size={22} color="#334155" />
            </TouchableOpacity>
          ) : null}
          <View style={[lightStyles.left, onMenuPress && { marginLeft: 4 }]}>
            <NexrydeMark size={34} />
            <Text style={lightStyles.brand}>NEXRYDE</Text>
          </View>
          <DriverHeaderAvatar
            uri={profileImageUri}
            onPress={onProfilePress}
            size={42}
            onlineDot={showOnlineDot}
          />
        </View>
        <View style={lightStyles.hairline} pointerEvents="none" />
      </View>
    );
  }

  return (
    <View style={styles.outer}>
      {Platform.OS !== 'web' ? (
        <BlurView intensity={HEADER_BLUR_DEFAULT} tint="dark" style={StyleSheet.absoluteFillObject} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(4,9,18,0.96)' }]} />
      )}
      <LinearGradient
        colors={['rgba(34,225,128,0.08)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.sheenDefault}
        pointerEvents="none"
      />
      <View style={[styles.wrap, { paddingTop: topInset + 6 }]}>
        <View style={styles.left}>
          <NexrydeMark size={34} />
          <Text style={styles.brand}>NEXRYDE</Text>
        </View>
        <DriverHeaderAvatar
          uri={profileImageUri}
          onPress={onProfilePress}
          size={42}
          onlineDot={showOnlineDot}
        />
      </View>
      <View style={styles.hairlineDefault} pointerEvents="none" />
    </View>
  );
}

const incomingStyles = StyleSheet.create({
  outer: {
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(52,245,184,0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconBtnOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  iconBtnGrad: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandNex: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.8,
  },
  brandR: {
    fontSize: 17,
    fontWeight: '800',
    color: '#4ADE80',
    letterSpacing: 0.8,
  },
  brandYde: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.8,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    backgroundColor: 'rgba(52,245,184,0.2)',
  },
  inboxBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: BRAND.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#0F172A',
  },
  inboxBadgeTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFF',
  },
});

const lightStyles = StyleSheet.create({
  outer: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 18,
    backgroundColor: '#E2E8F0',
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTxt: { fontSize: 14, fontWeight: '900', color: '#FFF', letterSpacing: -0.3 },
  brand: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  pillTxt: { fontSize: 11, fontWeight: '900', color: '#2563EB', letterSpacing: 0.8 },
});

const styles = StyleSheet.create({
  outer: {
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(59,130,246,0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  sheenDefault: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 64,
  },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  hairlineDefault: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 18,
    backgroundColor: 'rgba(59,130,246,0.16)',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.38)',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
  },
  logoTxt: { fontSize: 13, fontWeight: '900', color: '#F8FAFC', letterSpacing: -0.45 },
  brand: {
    fontSize: 17,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 1.35,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.42)',
  },
  pillTxt: { fontSize: 10, fontWeight: '900', color: '#EFF6FF', letterSpacing: 1.4 },
});
