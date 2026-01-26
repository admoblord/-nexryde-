import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '../constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = true,
}) => {
  const getButtonStyle = () => {
    const base: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.lg,
      ...SHADOWS.sm,
    };

    // Size styles
    const sizeStyles: Record<string, ViewStyle> = {
      sm: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
      md: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg },
      lg: { paddingVertical: SPACING.lg, paddingHorizontal: SPACING.xl },
    };

    // Variant styles
    const variantStyles: Record<string, ViewStyle> = {
      primary: { backgroundColor: COLORS.primary },
      secondary: { backgroundColor: COLORS.secondary },
      outline: { backgroundColor: 'transparent', borderWidth: 2, borderColor: COLORS.primary },
      ghost: { backgroundColor: 'transparent', ...SHADOWS.sm, shadowOpacity: 0, elevation: 0 },
    };

    return {
      ...base,
      ...sizeStyles[size],
      ...variantStyles[variant],
      ...(fullWidth && { width: '100%' }),
      ...(disabled && { opacity: 0.5 }),
    };
  };

  const getTextStyle = () => {
    const sizeStyles: Record<string, TextStyle> = {
      sm: { fontSize: FONT_SIZE.sm },
      md: { fontSize: FONT_SIZE.lg },
      lg: { fontSize: FONT_SIZE.xl },
    };

    const variantStyles: Record<string, TextStyle> = {
      primary: { color: COLORS.white },
      secondary: { color: COLORS.white },
      outline: { color: COLORS.primary },
      ghost: { color: COLORS.primary },
    };

    return {
      fontWeight: '600' as const,
      ...sizeStyles[size],
      ...variantStyles[variant],
    };
  };

  const iconSize = size === 'sm' ? 16 : size === 'md' ? 20 : 24;
  const iconColor = variant === 'primary' || variant === 'secondary' ? COLORS.white : COLORS.primary;

  return (
    <TouchableOpacity
      style={[getButtonStyle(), style] as ViewStyle[]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <Ionicons name={icon} size={iconSize} color={iconColor} style={{ marginRight: SPACING.sm }} />
          )}
          <Text style={[getTextStyle(), textStyle]}>{title}</Text>
          {icon && iconPosition === 'right' && (
            <Ionicons name={icon} size={iconSize} color={iconColor} style={{ marginLeft: SPACING.sm }} />
          )}
        </>
      )}
    </TouchableOpacity>
  );
};

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, style, onPress }) => {
  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={[styles.card, style]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {children}
    </Container>
  );
};

interface BadgeProps {
  text: string;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'default';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ text, variant = 'default', size = 'md' }) => {
  const variantColors: Record<string, { bg: string; text: string }> = {
    success: { bg: COLORS.success + '20', text: COLORS.success },
    warning: { bg: COLORS.warning + '20', text: COLORS.warning },
    error: { bg: COLORS.error + '20', text: COLORS.error },
    info: { bg: COLORS.info + '20', text: COLORS.info },
    default: { bg: COLORS.gray200, text: COLORS.gray600 },
  };

  const colors = variantColors[variant];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.bg },
        size === 'sm' && { paddingVertical: 2, paddingHorizontal: 6 },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          { color: colors.text },
          size === 'sm' && { fontSize: FONT_SIZE.xs },
        ]}
      >
        {text}
      </Text>
    </View>
  );
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  subtitle?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  iconColor = COLORS.primary,
  subtitle,
}) => {
  return (
    <Card style={styles.statCard}>
      {icon && (
        <View style={[styles.statIconContainer, { backgroundColor: iconColor + '20' }]}>
          <Ionicons name={icon} size={24} color={iconColor} />
        </View>
      )}
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.md,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  statCard: {
    alignItems: 'center',
    minWidth: 100,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  statTitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  statValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statSubtitle: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
});
