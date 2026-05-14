import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  COLORS,
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  useThemeColors,
} from '@/src/constants/theme';
import { DRIVER_OFFER_RINGTONES, type DriverOfferRingtoneId } from '@/src/constants/driverOfferSounds';
import { useDriverOfferSoundPrefs } from '@/src/hooks/useDriverOfferSoundPrefs';
import { playDriverOfferRingtonePreview } from '@/src/services/driverOfferRingtonePreview';

export function DriverOfferSoundPreferences({ defaultExpandedTones = false }: { defaultExpandedTones?: boolean }) {
  const { colors } = useThemeColors();
  const { ringtoneId, soundEnabled, setRingtone, setSoundEnabled } = useDriverOfferSoundPrefs();
  const [showTones, setShowTones] = useState(defaultExpandedTones);
  const [previewingId, setPreviewingId] = useState<DriverOfferRingtoneId | null>(null);

  const onPreview = useCallback(async (id: DriverOfferRingtoneId) => {
    if (Platform.OS === 'web') return;
    setPreviewingId(id);
    try {
      await playDriverOfferRingtonePreview(id);
    } finally {
      setPreviewingId(null);
    }
  }, []);

  const current = DRIVER_OFFER_RINGTONES.find((t) => t.id === ringtoneId) || DRIVER_OFFER_RINGTONES[0];

  return (
    <>
      <View style={[styles.menuItem, { borderBottomColor: COLORS.gray100 }]}>
        <View style={[styles.menuIcon, { backgroundColor: '#DCFCE7' }]}>
          <Ionicons name="volume-high-outline" size={20} color={COLORS.accentGreen} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuText, { color: colors.text }]}>Offer ringtone sound</Text>
          <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>
            Loops while a new ride request is on screen. Vibration stays on if sound is off.
          </Text>
        </View>
        <Switch
          value={soundEnabled}
          onValueChange={(v) => void setSoundEnabled(v)}
          trackColor={{ false: COLORS.gray200, true: COLORS.accentGreen + '50' }}
          thumbColor={soundEnabled ? COLORS.accentGreen : COLORS.gray100}
        />
      </View>

      <View style={[styles.block, { borderBottomColor: COLORS.gray100, opacity: soundEnabled ? 1 : 0.55 }]}>
        <TouchableOpacity
          style={styles.ringtoneHeader}
          onPress={() => soundEnabled && setShowTones(!showTones)}
          accessibilityRole="button"
          disabled={!soundEnabled}
        >
          <View style={[styles.menuIcon, { backgroundColor: '#E0F2FE' }]}>
            <Ionicons name="musical-notes-outline" size={20} color="#0284C7" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuText, { color: colors.text, marginLeft: SPACING.md }]}>Ringtone</Text>
            <Text style={[styles.menuSubtext, { marginLeft: SPACING.md, color: colors.textMuted }]}>
              {current.label} · {current.hint}
            </Text>
          </View>
          <Ionicons
            name={showTones ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={soundEnabled ? COLORS.gray400 : COLORS.gray200}
          />
        </TouchableOpacity>
        {showTones && soundEnabled && (
          <View style={styles.toneList}>
            {DRIVER_OFFER_RINGTONES.map((tone) => {
              const active = tone.id === ringtoneId;
              const loadingPreview = previewingId === tone.id;
              return (
                <View key={tone.id} style={[styles.toneRow, active && styles.toneRowActive]}>
                  <TouchableOpacity
                    style={styles.toneSelect}
                    onPress={() => void setRingtone(tone.id)}
                    accessibilityLabel={`Use ringtone ${tone.label}`}
                  >
                    <Text style={[styles.toneLabel, { color: active ? COLORS.accentGreen : colors.text }]}>
                      {tone.label}
                    </Text>
                    <Text style={[styles.toneHint, { color: colors.textMuted }]}>{tone.hint}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.previewBtn}
                    onPress={() => void onPreview(tone.id)}
                    accessibilityLabel={`Preview ${tone.label}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {loadingPreview ? (
                      <ActivityIndicator size="small" color="#0284C7" />
                    ) : (
                      <Ionicons name="play-circle-outline" size={28} color="#0284C7" />
                    )}
                  </TouchableOpacity>
                  {active && (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.accentGreen} style={styles.check} />
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  menuSubtext: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  block: {
    borderBottomWidth: 1,
  },
  ringtoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  toneList: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    gap: SPACING.xs,
  },
  toneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.gray50,
  },
  toneRowActive: {
    backgroundColor: COLORS.accentGreenSoft,
    borderWidth: 2,
    borderColor: COLORS.accentGreen,
  },
  toneSelect: {
    flex: 1,
    minWidth: 0,
  },
  toneLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
  },
  toneHint: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  previewBtn: {
    paddingHorizontal: SPACING.xs,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
  },
  check: {
    marginLeft: 4,
  },
});
