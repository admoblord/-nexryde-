import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_SIZE, SPACING, BORDER_RADIUS } from '@/src/constants/theme';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  tone?: 'danger' | 'warning' | 'info' | 'success';
  confirmText?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export const AlertModal: React.FC<Props> = ({
  visible,
  title,
  message,
  tone = 'info',
  confirmText = 'OK',
  onConfirm,
  onClose,
}) => {
  const toneColor =
    tone === 'danger' ? COLORS.error : tone === 'warning' ? COLORS.warning : tone === 'success' ? COLORS.success : COLORS.info;
  const icon = tone === 'danger' ? 'warning' : tone === 'warning' ? 'alert-circle' : tone === 'success' ? 'checkmark-circle' : 'information-circle';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Ionicons name={icon} size={44} color={toneColor} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <TouchableOpacity style={[styles.primary, { backgroundColor: toneColor }]} onPress={onConfirm}>
            <Text style={styles.primaryText}>{confirmText}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onClose}>
            <Text style={styles.secondaryText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlayLight,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    textAlign: 'center',
  },
  message: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gray600,
    lineHeight: 22,
    textAlign: 'center',
  },
  primary: {
    width: '100%',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    color: COLORS.white,
    fontWeight: '900',
    fontSize: FONT_SIZE.md,
  },
  secondary: {
    paddingVertical: SPACING.sm,
  },
  secondaryText: {
    color: COLORS.gray600,
    fontWeight: '700',
    fontSize: FONT_SIZE.sm,
  },
});
