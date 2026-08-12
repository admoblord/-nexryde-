/**
 * Avatar, name, status pill, right-aligned meta.
 *
 * One component for both directions: rider looking at their driver, and driver
 * looking at their rider.
 */
import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { alpha, colors, radius, space, type } from '@/src/theme/tokens';
import { StatusPill, type StatusTone } from '@/src/components/trip/StatusPill';

export function PersonRow({
  name,
  photoUri,
  statusLabel,
  statusTone = 'green',
  metaTop,
  metaBottom,
  subtitle,
  style,
}: {
  name: string;
  photoUri?: string | null;
  statusLabel?: string | null;
  statusTone?: StatusTone;
  /** Right-aligned emphasis, e.g. "6 min". */
  metaTop?: string | null;
  metaBottom?: string | null;
  subtitle?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.avatarWrap}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={22} color={colors.textTertiary} />
          </View>
        )}
      </View>

      <View style={styles.center}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {statusLabel ? (
          <StatusPill label={statusLabel} tone={statusTone} style={styles.pill} />
        ) : subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {metaTop || metaBottom ? (
        <View style={styles.meta}>
          {metaTop ? <Text style={styles.metaTop}>{metaTop}</Text> : null}
          {metaBottom ? <Text style={styles.metaBottom}>{metaBottom}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const AVATAR = 48;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { marginRight: space.md },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: colors.bgMuted },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, minWidth: 0 },
  name: { ...type.bodyBold, color: colors.textPrimary },
  subtitle: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  pill: { marginTop: 4 },
  meta: { alignItems: 'flex-end', marginLeft: space.md },
  metaTop: { ...type.bodyBold, color: colors.textPrimary },
  metaBottom: { ...type.caption, color: colors.textSecondary },
});

/** Vehicle strip: model · colour · plate. Plate is never allowed to render as a dash. */
export function VehicleStrip({
  model,
  colour,
  plate,
  style,
}: {
  model?: string | null;
  colour?: string | null;
  plate?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const parts = [model?.trim(), colour?.trim()].filter(Boolean) as string[];
  const plateText = (plate || '').trim();
  return (
    <View style={[vs.wrap, style]}>
      <Ionicons name="car" size={16} color={colors.textSecondary} />
      <Text style={vs.text} numberOfLines={1}>
        {parts.length ? parts.join(' · ') : 'Vehicle'}
      </Text>
      {plateText ? (
        <View style={vs.plate}>
          <Text style={vs.plateText} numberOfLines={1}>
            {plateText.toUpperCase()}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const vs = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgMuted,
    borderRadius: radius.button,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  text: { ...type.caption, color: colors.textSecondary, marginLeft: space.sm, flex: 1 },
  plate: {
    backgroundColor: alpha.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  plateText: { ...type.bodyBold, color: colors.textPrimary, letterSpacing: 1 },
});
