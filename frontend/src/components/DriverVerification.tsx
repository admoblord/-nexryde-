import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

interface VerificationBadgeProps {
  type: 'nin' | 'license' | 'vehicle' | 'background' | 'verified';
  status?: 'verified' | 'pending' | 'not_verified';
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  style?: ViewStyle;
}

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  type,
  status = 'verified',
  size = 'medium',
  showLabel = true,
  style,
}) => {
  const getBadgeConfig = () => {
    switch (type) {
      case 'nin':
        return {
          icon: 'card' as const,
          label: 'NIN Verified',
          color: COLORS.accentBlue,
          bgColor: COLORS.accentBlueSoft,
        };
      case 'license':
        return {
          icon: 'document-text' as const,
          label: 'License Verified',
          color: COLORS.accentGreen,
          bgColor: COLORS.accentGreenSoft,
        };
      case 'vehicle':
        return {
          icon: 'car' as const,
          label: 'Vehicle Verified',
          color: COLORS.accentPurple,
          bgColor: COLORS.accentPurpleSoft,
        };
      case 'background':
        return {
          icon: 'shield-checkmark' as const,
          label: 'Background Check',
          color: COLORS.success,
          bgColor: COLORS.success + '15',
        };
      case 'verified':
      default:
        return {
          icon: 'checkmark-circle' as const,
          label: 'Verified Driver',
          color: COLORS.success,
          bgColor: COLORS.success + '15',
        };
    }
  };

  const getSizeConfig = () => {
    switch (size) {
      case 'small':
        return {
          containerPadding: SPACING.xs,
          iconSize: 14,
          fontSize: FONT_SIZE.xs,
          gap: SPACING.xs / 2,
        };
      case 'large':
        return {
          containerPadding: SPACING.sm + 2,
          iconSize: 20,
          fontSize: FONT_SIZE.sm,
          gap: SPACING.xs,
        };
      case 'medium':
      default:
        return {
          containerPadding: SPACING.xs + 2,
          iconSize: 16,
          fontSize: FONT_SIZE.xs + 1,
          gap: SPACING.xs,
        };
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'verified':
        return getBadgeConfig().color;
      case 'pending':
        return COLORS.warning;
      case 'not_verified':
        return COLORS.gray400;
      default:
        return getBadgeConfig().color;
    }
  };

  const config = getBadgeConfig();
  const sizeConfig = getSizeConfig();
  const statusColor = getStatusColor();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: status === 'verified' ? config.bgColor : COLORS.gray100,
          paddingHorizontal: sizeConfig.containerPadding,
          paddingVertical: sizeConfig.containerPadding - 2,
          gap: sizeConfig.gap,
        },
        style,
      ]}
    >
      <Ionicons name={config.icon} size={sizeConfig.iconSize} color={statusColor} />
      {showLabel && (
        <Text
          style={[
            styles.label,
            {
              fontSize: sizeConfig.fontSize,
              color: statusColor,
            },
          ]}
        >
          {config.label}
        </Text>
      )}
    </View>
  );
};

interface TrustScoreProps {
  score: number;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  style?: ViewStyle;
}

export const TrustScore: React.FC<TrustScoreProps> = ({
  score,
  size = 'medium',
  showLabel = true,
  style,
}) => {
  const getScoreColor = () => {
    if (score >= 95) return COLORS.success;
    if (score >= 85) return COLORS.accentGreen;
    if (score >= 70) return COLORS.warning;
    return COLORS.error;
  };

  const getScoreLabel = () => {
    if (score >= 95) return 'Excellent';
    if (score >= 85) return 'Very Good';
    if (score >= 70) return 'Good';
    return 'Fair';
  };

  const getSizeConfig = () => {
    switch (size) {
      case 'small':
        return {
          containerSize: 40,
          scoreSize: FONT_SIZE.md,
          labelSize: FONT_SIZE.xs - 1,
          iconSize: 18,
        };
      case 'large':
        return {
          containerSize: 70,
          scoreSize: FONT_SIZE.xxl,
          labelSize: FONT_SIZE.sm,
          iconSize: 28,
        };
      case 'medium':
      default:
        return {
          containerSize: 56,
          scoreSize: FONT_SIZE.lg,
          labelSize: FONT_SIZE.xs,
          iconSize: 22,
        };
    }
  };

  const color = getScoreColor();
  const sizeConfig = getSizeConfig();

  return (
    <View style={[styles.trustScoreContainer, style]}>
      <View
        style={[
          styles.trustScoreCircle,
          {
            width: sizeConfig.containerSize,
            height: sizeConfig.containerSize,
            backgroundColor: color + '15',
            borderColor: color + '40',
          },
        ]}
      >
        <Ionicons name="shield-checkmark" size={sizeConfig.iconSize} color={color} />
        <Text
          style={[
            styles.trustScoreNumber,
            {
              fontSize: sizeConfig.scoreSize,
              color: color,
            },
          ]}
        >
          {score}
        </Text>
      </View>
      {showLabel && (
        <Text
          style={[
            styles.trustScoreLabel,
            {
              fontSize: sizeConfig.labelSize,
              color: color,
            },
          ]}
        >
          {getScoreLabel()}
        </Text>
      )}
    </View>
  );
};

interface DriverVerificationCardProps {
  driverName: string;
  ninVerified: boolean;
  licenseVerified: boolean;
  vehicleVerified: boolean;
  backgroundCheck: boolean;
  trustScore: number;
  compact?: boolean;
  style?: ViewStyle;
}

export const DriverVerificationCard: React.FC<DriverVerificationCardProps> = ({
  driverName,
  ninVerified,
  licenseVerified,
  vehicleVerified,
  backgroundCheck,
  trustScore,
  compact = false,
  style,
}) => {
  const allVerified = ninVerified && licenseVerified && vehicleVerified && backgroundCheck;

  if (compact) {
    return (
      <View style={[styles.compactCard, style]}>
        <View style={styles.compactHeader}>
          <Ionicons
            name={allVerified ? 'shield-checkmark' : 'shield-outline'}
            size={20}
            color={allVerified ? COLORS.success : COLORS.warning}
          />
          <Text style={styles.compactTitle}>Driver Verification</Text>
        </View>
        <View style={styles.compactBadges}>
          {ninVerified && <VerificationBadge type="nin" size="small" showLabel={false} />}
          {licenseVerified && <VerificationBadge type="license" size="small" showLabel={false} />}
          {vehicleVerified && <VerificationBadge type="vehicle" size="small" showLabel={false} />}
          {backgroundCheck && <VerificationBadge type="background" size="small" showLabel={false} />}
        </View>
        <TrustScore score={trustScore} size="small" showLabel={false} />
      </View>
    );
  }

  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons
            name={allVerified ? 'shield-checkmark' : 'shield-outline'}
            size={28}
            color={allVerified ? COLORS.success : COLORS.warning}
          />
          <View>
            <Text style={styles.cardTitle}>{driverName}</Text>
            <Text style={styles.cardSubtitle}>
              {allVerified ? 'Fully Verified Driver' : 'Verification In Progress'}
            </Text>
          </View>
        </View>
        <TrustScore score={trustScore} size="medium" />
      </View>

      <View style={styles.divider} />

      <View style={styles.verificationsGrid}>
        <VerificationBadge
          type="nin"
          status={ninVerified ? 'verified' : 'not_verified'}
          size="medium"
        />
        <VerificationBadge
          type="license"
          status={licenseVerified ? 'verified' : 'not_verified'}
          size="medium"
        />
        <VerificationBadge
          type="vehicle"
          status={vehicleVerified ? 'verified' : 'not_verified'}
          size="medium"
        />
        <VerificationBadge
          type="background"
          status={backgroundCheck ? 'verified' : 'not_verified'}
          size="medium"
        />
      </View>

      {allVerified && (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
          <Text style={styles.successText}>All verifications completed ✓</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  // Verification Badge
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  label: {
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // Trust Score
  trustScoreContainer: {
    alignItems: 'center',
  },
  trustScoreCircle: {
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  trustScoreNumber: {
    fontWeight: '900',
    marginTop: -2,
  },
  trustScoreLabel: {
    fontWeight: '800',
    marginTop: SPACING.xs / 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Driver Verification Card
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  cardTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  cardSubtitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.lightBorder,
    marginBottom: SPACING.md,
  },
  verificationsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.success + '15',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.md,
  },
  successText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.success,
  },

  // Compact Card
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    gap: SPACING.sm,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flex: 1,
  },
  compactTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  compactBadges: {
    flexDirection: 'row',
    gap: SPACING.xs / 2,
  },
});
