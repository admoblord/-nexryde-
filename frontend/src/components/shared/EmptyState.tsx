/**
 * Reusable empty state component for wallet, trips, notifications, and other lists.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'receipt-outline',
  title,
  subtitle,
  actionLabel,
  onAction,
}) => (
  <View style={styles.container}>
    <View style={styles.iconWrap}>
      <Ionicons name={icon} size={40} color="#4B5563" />
    </View>
    <Text style={styles.title}>{title}</Text>
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    {actionLabel && onAction ? (
      <TouchableOpacity style={styles.btn} onPress={onAction} activeOpacity={0.8}>
        <Text style={styles.btnText}>{actionLabel}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

// Specific variants

export const NoTripsEmpty: React.FC<{ onBook?: () => void }> = ({ onBook }) => (
  <EmptyState
    icon="car-outline"
    title="No trips yet"
    subtitle="Your completed rides will appear here."
    actionLabel={onBook ? 'Book a ride' : undefined}
    onAction={onBook}
  />
);

export const NoTransactionsEmpty: React.FC<{ onTopUp?: () => void }> = ({ onTopUp }) => (
  <EmptyState
    icon="wallet-outline"
    title="No transactions"
    subtitle="Your wallet top-ups and trip payments will appear here."
    actionLabel={onTopUp ? 'Top up wallet' : undefined}
    onAction={onTopUp}
  />
);

export const NoNotificationsEmpty: React.FC = () => (
  <EmptyState
    icon="notifications-outline"
    title="You're all caught up"
    subtitle="New ride updates and promotions will appear here."
  />
);

export const NoDriversNearbyEmpty: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <EmptyState
    icon="location-outline"
    title="No drivers nearby"
    subtitle="Try again in a moment — drivers are on their way to your area."
    actionLabel={onRetry ? 'Retry' : undefined}
    onAction={onRetry}
  />
);

export const NetworkErrorEmpty: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <EmptyState
    icon="cloud-offline-outline"
    title="Can't reach the server"
    subtitle="Check your internet connection and try again."
    actionLabel={onRetry ? 'Retry' : undefined}
    onAction={onRetry}
  />
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#F1F5F9',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  btn: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#022C22',
  },
});
