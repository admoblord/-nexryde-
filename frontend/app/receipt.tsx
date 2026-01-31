import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function ReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const receiptRef = useRef(null);

  // Parse trip data from params or use dummy data
  const tripData = {
    receiptId: params.receiptId || `NEX-${new Date().getFullYear()}-${Math.floor(Math.random() * 999999).toString().padStart(6, '0')}`,
    date: params.date || new Date().toLocaleString('en-NG', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
    pickupAddress: params.pickup || 'Victoria Island, Lagos',
    dropoffAddress: params.dropoff || 'Lekki Phase 1, Lagos',
    distance: params.distance || '12.5',
    duration: params.duration || '25',
    driverName: params.driverName || 'John Doe',
    driverVehicle: params.vehicle || 'Toyota Camry',
    driverPlate: params.plate || 'ABC-123XY',
    baseFare: parseFloat(params.baseFare || '500'),
    distanceFare: parseFloat(params.distanceFare || '1250'),
    timeFare: parseFloat(params.timeFare || '625'),
    total: parseFloat(params.total || '2375'),
    paymentMethod: params.payment || 'Cash',
    status: params.status || 'Completed',
  };

  const handleDownload = async () => {
    try {
      if (!receiptRef.current) return;

      // Capture the receipt as image
      const uri = await captureRef(receiptRef, {
        format: 'png',
        quality: 1,
      });

      // Save to device
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        const fileUri = `${FileSystem.documentDirectory}NexRyde_Receipt_${tripData.receiptId}.png`;
        await FileSystem.copyAsync({
          from: uri,
          to: fileUri,
        });

        Alert.alert('Success', 'Receipt saved to your device!');
      }
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to download receipt');
    }
  };

  const handleShare = async () => {
    try {
      if (!receiptRef.current) return;

      const uri = await captureRef(receiptRef, {
        format: 'png',
        quality: 1,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share NexRyde Receipt',
        });
      } else {
        // Fallback to standard share
        await Share.share({
          message: `NexRyde Receipt ${tripData.receiptId}\nTotal: ₦${tripData.total.toLocaleString()}`,
          title: 'NexRyde Receipt',
        });
      }
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Error', 'Failed to share receipt');
    }
  };

  const handleEmail = () => {
    Alert.alert(
      'Email Receipt',
      'Enter your email address:',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Send',
          onPress: () => Alert.alert('Success', 'Receipt sent to your email!')
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryLight]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trip Receipt</Text>
          <TouchableOpacity style={styles.headerButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={24} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Receipt Card */}
          <View ref={receiptRef} style={styles.receiptCard}>
            {/* Logo & Header */}
            <View style={styles.receiptHeader}>
              <View style={styles.logoSection}>
                <Text style={styles.brandNex}>NEX</Text>
                <Text style={styles.brandRyde}>RYDE</Text>
              </View>
              <Text style={styles.receiptTitle}>TRIP RECEIPT</Text>
            </View>

            {/* Receipt Info */}
            <View style={styles.receiptInfo}>
              <Text style={styles.receiptId}>Receipt #{tripData.receiptId}</Text>
              <Text style={styles.receiptDate}>{tripData.date}</Text>
            </View>

            <View style={styles.divider} />

            {/* Trip Details */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>TRIP DETAILS</Text>
              
              <View style={styles.locationRow}>
                <View style={styles.locationDot} />
                <View style={styles.locationContent}>
                  <Text style={styles.locationLabel}>From</Text>
                  <Text style={styles.locationText}>{tripData.pickupAddress}</Text>
                </View>
              </View>

              <View style={styles.locationLine} />

              <View style={styles.locationRow}>
                <View style={[styles.locationDot, styles.locationDotEnd]} />
                <View style={styles.locationContent}>
                  <Text style={styles.locationLabel}>To</Text>
                  <Text style={styles.locationText}>{tripData.dropoffAddress}</Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="speedometer" size={16} color={COLORS.accentGreen} />
                  <Text style={styles.statValue}>{tripData.distance} km</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="time" size={16} color={COLORS.accentBlue} />
                  <Text style={styles.statValue}>{tripData.duration} min</Text>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Driver Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DRIVER INFORMATION</Text>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name</Text>
                <Text style={styles.infoValue}>{tripData.driverName}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Vehicle</Text>
                <Text style={styles.infoValue}>{tripData.driverVehicle}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Plate Number</Text>
                <Text style={styles.infoValue}>{tripData.driverPlate}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Fare Breakdown */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>FARE BREAKDOWN</Text>
              
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Base fare</Text>
                <Text style={styles.fareValue}>₦{tripData.baseFare.toLocaleString()}</Text>
              </View>
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Distance ({tripData.distance} km)</Text>
                <Text style={styles.fareValue}>₦{tripData.distanceFare.toLocaleString()}</Text>
              </View>
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Time ({tripData.duration} min)</Text>
                <Text style={styles.fareValue}>₦{tripData.timeFare.toLocaleString()}</Text>
              </View>

              <View style={styles.totalDivider} />

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>₦{tripData.total.toLocaleString()}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Payment Info */}
            <View style={styles.paymentSection}>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Payment Method</Text>
                <View style={styles.paymentBadge}>
                  <Text style={styles.paymentValue}>{tripData.paymentMethod}</Text>
                </View>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Status</Text>
                <View style={[styles.statusBadge, styles.statusSuccess]}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.accentGreen} />
                  <Text style={styles.statusText}>{tripData.status}</Text>
                </View>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Thank you for riding with NexRyde!</Text>
              <Text style={styles.footerSubtext}>Nigeria's #1 Ride-Hailing Platform</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.actionButton} onPress={handleDownload}>
              <LinearGradient
                colors={[COLORS.accentBlue, COLORS.accentBlueDark]}
                style={styles.actionButtonGradient}
              >
                <Ionicons name="download" size={20} color={COLORS.white} />
                <Text style={styles.actionButtonText}>Download</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleEmail}>
              <LinearGradient
                colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
                style={styles.actionButtonGradient}
              >
                <Ionicons name="mail" size={20} color={COLORS.white} />
                <Text style={styles.actionButtonText}>Email</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Help Text */}
          <Text style={styles.helpText}>
            Need help? Contact support@nexryde.com
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  receiptCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  brandNex: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 2,
  },
  brandRyde: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.accentGreen,
    letterSpacing: 2,
  },
  receiptTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  receiptInfo: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  receiptId: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.xs,
    letterSpacing: -0.5,
  },
  receiptDate: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#475569',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.lightBorder,
    marginVertical: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accentGreen,
    marginTop: 4,
  },
  locationDotEnd: {
    backgroundColor: COLORS.error,
  },
  locationLine: {
    width: 2,
    height: 20,
    backgroundColor: COLORS.lightBorder,
    marginLeft: 5,
    marginVertical: SPACING.xs,
  },
  locationContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  locationLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  locationText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: '#0F172A',
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.md,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#0F172A',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  infoLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#0F172A',
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  fareLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fareValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#0F172A',
  },
  totalDivider: {
    height: 1,
    backgroundColor: COLORS.lightTextPrimary,
    marginVertical: SPACING.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  totalValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.accentGreen,
    textShadowColor: 'rgba(34, 197, 94, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  paymentSection: {
    gap: SPACING.md,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  paymentBadge: {
    backgroundColor: COLORS.lightSurface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.lg,
  },
  paymentValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.xs,
  },
  statusSuccess: {
    backgroundColor: COLORS.successSoft,
  },
  statusText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accentGreen,
  },
  footer: {
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
  },
  footerText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: SPACING.xs,
  },
  footerSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextMuted,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  actionButton: {
    flex: 1,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  actionButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
  },
  helpText: {
    textAlign: 'center',
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#475569',
  },
});
