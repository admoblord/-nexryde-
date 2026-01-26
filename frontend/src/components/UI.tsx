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
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'gold';
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
      borderRadius: BORDER_RADIUS.xl,
    };

    const sizeStyles: Record<string, ViewStyle> = {
      sm: { paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.md },
      md: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg },
      lg: { paddingVertical: SPACING.lg, paddingHorizontal: SPACING.xl },
    };

    const variantStyles: Record<string, ViewStyle> = {
      primary: { 
        backgroundColor: COLORS.primary,
        ...SHADOWS.md,
      },
      secondary: { 
        backgroundColor: COLORS.secondary,
        ...SHADOWS.sm,
      },
      gold: {
        backgroundColor: COLORS.accent,
        ...SHADOWS.gold,
      },
      outline: { 
        backgroundColor: 'transparent', 
        borderWidth: 2, 
        borderColor: COLORS.primary,
      },
      ghost: { 
        backgroundColor: COLORS.gray100,
      },
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
      md: { fontSize: FONT_SIZE.md },
      lg: { fontSize: FONT_SIZE.lg },
    };

    const variantStyles: Record<string, TextStyle> = {
      primary: { color: COLORS.accent },
      secondary: { color: COLORS.white },
      gold: { color: COLORS.primary },
      outline: { color: COLORS.primary },
      ghost: { color: COLORS.textPrimary },
    };

    return {
      fontWeight: '700' as const,
      ...sizeStyles[size],
      ...variantStyles[variant],
    };
  };

  const iconSize = size === 'sm' ? 16 : size === 'md' ? 20 : 24;
  const getIconColor = () => {
    switch (variant) {
      case 'primary': return COLORS.accent;
      case 'gold': return COLORS.primary;
      case 'outline': return COLORS.primary;
      case 'ghost': return COLORS.textPrimary;
      default: return COLORS.white;
    }
  };

  return (
    <TouchableOpacity
      style={[getButtonStyle(), style] as ViewStyle[]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={getIconColor()} />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <Ionicons name={icon} size={iconSize} color={getIconColor()} style={{ marginRight: SPACING.sm }} />
          )}
          <Text style={[getTextStyle(), textStyle]}>{title}</Text>
          {icon && iconPosition === 'right' && (
            <Ionicons name={icon} size={iconSize} color={getIconColor()} style={{ marginLeft: SPACING.sm }} />
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
  variant?: 'default' | 'elevated' | 'outlined' | 'dark';
}

export const Card: React.FC<CardProps> = ({ children, style, onPress, variant = 'default' }) => {
  const Container = onPress ? TouchableOpacity : View;
  
  const getCardStyle = (): ViewStyle => {
    const base: ViewStyle = {
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.md,
    };
    
    switch (variant) {
      case 'elevated':
        return { ...base, backgroundColor: COLORS.white, ...SHADOWS.lg };
      case 'outlined':
        return { ...base, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border };
      case 'dark':
        return { ...base, backgroundColor: COLORS.primary, ...SHADOWS.md };
      default:
        return { ...base, backgroundColor: COLORS.white, ...SHADOWS.sm };
    }
  };

  return (
    <Container
      style={[getCardStyle(), style]}
      onPress={onPress}
      activeOpacity={onPress ? 0.8 : 1}
    >
      {children}
    </Container>
  );
};

interface BadgeProps {
  text: string;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'default' | 'gold' | 'dark';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ text, variant = 'default', size = 'md' }) => {
  const variantColors: Record<string, { bg: string; text: string }> = {
    success: { bg: COLORS.successSoft, text: COLORS.success },
    warning: { bg: COLORS.warningSoft, text: COLORS.warning },
    error: { bg: COLORS.errorSoft, text: COLORS.error },
    info: { bg: COLORS.infoSoft, text: COLORS.info },
    gold: { bg: COLORS.accentSoft, text: COLORS.accentMuted },
    dark: { bg: COLORS.primary, text: COLORS.accent },
    default: { bg: COLORS.gray100, text: COLORS.gray600 },
  };

  const colors = variantColors[variant];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.bg },
        size === 'sm' && { paddingVertical: 3, paddingHorizontal: 8 },
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
  variant?: 'default' | 'gold';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  iconColor = COLORS.accent,
  subtitle,
  variant = 'default',
}) => {
  const isDark = variant === 'gold';
  
  return (
    <Card style={styles.statCard} variant={isDark ? 'dark' : 'default'}>
      {icon && (
        <View style={[
          styles.statIconContainer, 
          { backgroundColor: isDark ? 'rgba(255,215,0,0.15)' : iconColor + '15' }
        ]}>
          <Ionicons name={icon} size={24} color={isDark ? COLORS.accent : iconColor} />
        </View>
      )}
      <Text style={[styles.statTitle, isDark && { color: COLORS.gray400 }]}>{title}</Text>
      <Text style={[styles.statValue, isDark && { color: COLORS.accent }]}>{value}</Text>
      {subtitle && <Text style={[styles.statSubtitle, isDark && { color: COLORS.gray500 }]}>{subtitle}</Text>}
    </Card>
  );
};

// Premium Divider Component
interface DividerProps {
  variant?: 'default' | 'gold';
  spacing?: number;
}

export const Divider: React.FC<DividerProps> = ({ variant = 'default', spacing = SPACING.md }) => (
  <View style={[
    styles.divider,
    { marginVertical: spacing },
    variant === 'gold' && { backgroundColor: COLORS.accent, opacity: 0.3 }
  ]} />
);

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  statCard: {
    alignItems: 'center',
    minWidth: 100,
    padding: SPACING.md,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  statTitle: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    fontWeight: '500',
  },
  statValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  statSubtitle: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    marginTop: SPACING.xs,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    width: '100%',
  },
});
