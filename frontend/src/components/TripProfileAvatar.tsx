/**
 * Trip portrait — resolves API media URLs, prefers face then profile, person icon on failure.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Platform,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolvePublicMediaUri } from '@/src/utils/resolvePublicMediaUri';
import {
  pickDriverPhotoRaw,
  pickRiderPhotoRaw,
  resolveDriverPhotoUri,
  resolveRiderPhotoUri,
} from '@/src/utils/tripProfilePhotos';

export type TripProfileAvatarProps = {
  size: number;
  /** Direct URI (already resolved or raw API path). */
  uri?: string | null;
  faceUri?: string | null;
  profileUri?: string | null;
  /** When set, reads rider_* or driver fields from this object. */
  person?: Record<string, unknown> | null;
  role?: 'driver' | 'rider';
  borderColor?: string;
  borderWidth?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
  showOnlineDot?: boolean;
  onlineDotColor?: string;
  placeholderIconSize?: number;
};

export function TripProfileAvatar({
  size,
  uri,
  faceUri,
  profileUri,
  person,
  role,
  borderColor = 'rgba(34,197,94,0.55)',
  borderWidth = 2,
  style,
  imageStyle,
  accessibilityLabel,
  showOnlineDot,
  onlineDotColor = '#22C55E',
  placeholderIconSize,
}: TripProfileAvatarProps) {
  const resolvedUri = useMemo(() => {
    if (uri) return resolvePublicMediaUri(uri);
    // Uber-style display: framed profile first, face/URL as fallback.
    if (faceUri || profileUri) {
      return resolvePublicMediaUri(profileUri) || resolvePublicMediaUri(faceUri);
    }
    if (person && role === 'driver') return resolveDriverPhotoUri(person);
    if (person && role === 'rider') return resolveRiderPhotoUri(person);
    if (person) {
      const d = pickDriverPhotoRaw(person);
      const r = pickRiderPhotoRaw(person);
      return (
        resolvePublicMediaUri(d.profile) ||
        resolvePublicMediaUri(d.face) ||
        resolvePublicMediaUri(r)
      );
    }
    return null;
  }, [uri, faceUri, profileUri, person, role]);

  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [resolvedUri]);

  const r = size / 2;
  const outer = size + borderWidth * 2;
  const iconSize = placeholderIconSize ?? Math.round(size * 0.44);

  return (
    <View
      style={[
        {
          width: outer,
          height: outer,
          borderRadius: outer / 2,
          borderWidth,
          borderColor,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(15,23,42,0.6)',
          // Soft lift so the circle reads clearly on map chrome (Uber-like).
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.18,
          shadowRadius: 4,
          elevation: 3,
        },
        style,
      ]}
    >
      {resolvedUri && !failed ? (
        <Image
          source={{ uri: resolvedUri }}
          style={[
            {
              width: size,
              height: size,
              borderRadius: r,
              backgroundColor: '#1E293B',
            },
            imageStyle,
          ]}
          resizeMode="cover"
          accessibilityLabel={accessibilityLabel}
          onError={() => setFailed(true)}
          {...(Platform.OS === 'android' ? { fadeDuration: 0 } : {})}
        />
      ) : (
        <View
          style={[styles.placeholder, { width: size, height: size, borderRadius: r }]}
          accessibilityLabel={accessibilityLabel ?? 'Profile photo unavailable'}
        >
          <Ionicons name="person" size={iconSize} color="#86EFAC" />
        </View>
      )}
      {showOnlineDot ? (
        <View
          style={[
            styles.onlineDot,
            {
              backgroundColor: onlineDotColor,
              width: Math.max(10, size * 0.18),
              height: Math.max(10, size * 0.18),
              borderRadius: Math.max(5, size * 0.09),
              right: Math.max(0, borderWidth - 1),
              bottom: Math.max(0, borderWidth - 1),
            },
          ]}
        />
      ) : null}
    </View>
  );
}

/** Drop-in for RideMap `ResolvedProfilePhoto` — same behavior, shared module. */
export function ResolvedProfilePhoto({
  uri,
  imageStyle,
  fallback,
  accessibilityLabel,
}: {
  uri?: string | null;
  imageStyle: StyleProp<ImageStyle>;
  fallback?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const flat = StyleSheet.flatten(imageStyle);
  const w = typeof flat?.width === 'number' ? flat.width : 56;
  const h = typeof flat?.height === 'number' ? flat.height : w;
  const size = Math.min(w, h);

  if (!uri) {
    return (
      <View style={[{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }, imageStyle]}>
        {fallback ?? (
          <Ionicons name="person" size={Math.round(size * 0.5)} color="#86EFAC" />
        )}
      </View>
    );
  }

  return (
    <TripProfileAvatar
      size={size}
      uri={uri}
      imageStyle={imageStyle}
      accessibilityLabel={accessibilityLabel}
      borderWidth={0}
      borderColor="transparent"
      style={{ width: w, height: h, borderRadius: flat?.borderRadius as number | undefined }}
      placeholderIconSize={Math.round(size * 0.5)}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  onlineDot: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#0F172A',
  },
});
