import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

const COLORS = {
  primary: '#22E180',
  secondary: '#6366F1',
  text: '#0F172A',
  textSecondary: '#64748B',
  background: '#FFFFFF',
  border: '#E2E8F0',
};

interface DriverTermsModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export default function DriverTermsModal({ visible, onAccept, onDecline }: DriverTermsModalProps) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
    if (isAtBottom) {
      setHasScrolledToBottom(true);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDecline}
    >
      <View style={styles.container}>
        {/* HEADER */}
        <LinearGradient
          colors={[COLORS.primary, '#1BC770']}
          style={styles.header}
        >
          <Text style={styles.headerTitle}>Driver Terms & Conditions</Text>
          <Text style={styles.headerSubtitle}>Please read carefully before continuing</Text>
        </LinearGradient>

        {/* TERMS CONTENT */}
        <ScrollView 
          style={styles.content}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <View style={styles.section}>
            <Text style={styles.lastUpdated}>Last Updated: February 3, 2026</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. DRIVER PARTNERSHIP AGREEMENT</Text>
            <Text style={styles.text}>
              By registering as a driver-partner with NEXRYDE, you enter into a working agreement with NEXRYDE. As a NEXRYDE worker, you maintain control over your schedule, vehicle, and work operations while being supported by the platform.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. DRIVER REQUIREMENTS</Text>
            <Text style={styles.text}>
              You must meet the following requirements:{'\n\n'}
              • Be at least 21 years old{'\n'}
              • Hold a valid Nigerian driver's license{'\n'}
              • Have at least 2 years of driving experience{'\n'}
              • Provide valid vehicle registration and insurance{'\n'}
              • Pass a background verification check{'\n'}
              • Maintain a clean driving record{'\n'}
              • Provide a valid National Identity Number (NIN){'\n'}
              • Own or have legal access to a registered vehicle
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. SUBSCRIPTION & EARNINGS</Text>
            <Text style={styles.text}>
              <Text style={styles.bold}>You keep 100% of your earnings.</Text> NEXRYDE operates on a subscription model, not commission-based.{'\n\n'}
              
              <Text style={styles.bold}>City Rider Plan:</Text>{'\n'}
              • Weekly subscription fee applies{'\n'}
              • Unlimited rides within city limits{'\n'}
              • Access to basic features{'\n\n'}
              
              <Text style={styles.bold}>Road Warrior Plan:</Text>{'\n'}
              • Monthly subscription fee applies{'\n'}
              • Unlimited rides (city + intercity){'\n'}
              • Access to premium features (AI Coach, Smart Mode, etc.){'\n'}
              • Priority support{'\n\n'}
              
              Payment is due at the start of each subscription period. Late payments may result in temporary account suspension.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. DRIVER CONDUCT & BEHAVIOR</Text>
            <Text style={styles.text}>
              As a NEXRYDE driver, you agree to:{'\n\n'}
              • Maintain professional behavior at all times{'\n'}
              • Provide safe and courteous service{'\n'}
              • Keep your vehicle clean and well-maintained{'\n'}
              • Follow all traffic laws and regulations{'\n'}
              • Not discriminate against riders based on destination, race, religion, gender, or disability{'\n'}
              • Accept ride requests within a reasonable time{'\n'}
              • Maintain an acceptance rate of at least 70%{'\n'}
              • Keep cancellation rate below 15%{'\n'}
              • Maintain a minimum rating of 4.5 stars
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. PROHIBITED ACTIVITIES</Text>
            <Text style={styles.text}>
              The following are strictly prohibited:{'\n\n'}
              • Requesting cash payments outside the app{'\n'}
              • Harassing or threatening riders{'\n'}
              • Using the platform for illegal activities{'\n'}
              • Sharing rider personal information{'\n'}
              • Operating the vehicle while intoxicated{'\n'}
              • Allowing unauthorized persons to drive{'\n'}
              • Manipulating ratings or reviews{'\n'}
              • Creating multiple accounts{'\n'}
              • Discriminating against any rider
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. SAFETY & SECURITY</Text>
            <Text style={styles.text}>
              • You consent to trip recording for safety purposes{'\n'}
              • GPS tracking is required while online{'\n'}
              • You must use the in-app navigation and safety features{'\n'}
              • Report any safety incidents immediately{'\n'}
              • Emergency SOS button available at all times{'\n'}
              • NEXRYDE may share your location with riders and emergency services{'\n'}
              • Background checks may be conducted periodically
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. VEHICLE INSURANCE & LIABILITY</Text>
            <Text style={styles.text}>
              • You must maintain valid commercial vehicle insurance{'\n'}
              • You are responsible for all vehicle-related costs (fuel, maintenance, repairs){'\n'}
              • NEXRYDE is not liable for accidents, damages, or injuries during trips{'\n'}
              • You indemnify NEXRYDE from all claims arising from your driving{'\n'}
              • Ensure your insurance covers ride-hailing activities
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>8. PRICING & PAYMENT</Text>
            <Text style={styles.text}>
              • Fares are calculated using NEXRYDE's algorithm based on distance, time, and traffic{'\n'}
              • Surge pricing may apply during peak hours or high demand{'\n'}
              • You must collect the exact fare shown in the app{'\n'}
              • Cash payments must be reported accurately{'\n'}
              • Weekly payouts to your registered bank account{'\n'}
              • Subscription fees are deducted automatically
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>9. ACCOUNT SUSPENSION & TERMINATION</Text>
            <Text style={styles.text}>
              NEXRYDE may suspend or terminate your account for:{'\n\n'}
              • Violation of these terms{'\n'}
              • Poor ratings (below 4.5){'\n'}
              • High cancellation rate (above 15%){'\n'}
              • Low acceptance rate (below 70%){'\n'}
              • Non-payment of subscription fees{'\n'}
              • Fraudulent activities{'\n'}
              • Safety violations{'\n'}
              • Expired documents (license, insurance, etc.){'\n\n'}
              
              You may voluntarily deactivate your account at any time through the app settings.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>10. DATA & PRIVACY</Text>
            <Text style={styles.text}>
              • We collect your location data while you're online{'\n'}
              • Trip data is stored for safety and quality purposes{'\n'}
              • Your personal information is protected per Nigerian data laws{'\n'}
              • You consent to NEXRYDE sharing your profile with riders{'\n'}
              • Trip recordings are stored securely and may be used for dispute resolution{'\n'}
              • We may use your data to improve our services
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>11. TAXES & COMPLIANCE</Text>
            <Text style={styles.text}>
              • You are responsible for all taxes on your earnings{'\n'}
              • NEXRYDE will provide annual earning statements{'\n'}
              • You must comply with all Nigerian tax laws{'\n'}
              • Keep accurate records of your income and expenses{'\n'}
              • Consult a tax professional for guidance
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>12. REWARDS & INCENTIVES</Text>
            <Text style={styles.text}>
              • Earn badges, achievements, and climb driver tiers{'\n'}
              • Participate in daily and weekly challenges{'\n'}
              • Maintain streaks for bonus rewards{'\n'}
              • Climb from Bronze to Diamond tier{'\n'}
              • Rewards are subject to performance and behavior score{'\n'}
              • NEXRYDE reserves the right to modify reward programs
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>13. DISPUTE RESOLUTION</Text>
            <Text style={styles.text}>
              • All disputes must be reported within 48 hours{'\n'}
              • NEXRYDE will review trip recordings and data{'\n'}
              • Decisions are final and binding{'\n'}
              • For legal disputes, Nigerian law applies{'\n'}
              • Jurisdiction: Federal High Court of Nigeria
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>14. AMENDMENTS</Text>
            <Text style={styles.text}>
              NEXRYDE reserves the right to modify these terms at any time. You will be notified of material changes. Continued use of the platform constitutes acceptance of updated terms.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>15. CONTACT</Text>
            <Text style={styles.text}>
              For questions or concerns:{'\n'}
              Email: support@nexryde.com{'\n'}
              Phone: +234 800 NEXRYDE{'\n'}
              Address: Lagos, Nigeria
            </Text>
          </View>

          <View style={styles.declaration}>
            <Text style={styles.declarationText}>
              By accepting these terms, you declare that you have read, understood, and agree to be bound by all the terms and conditions stated above.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* ACCEPT/DECLINE BUTTONS */}
        <View style={styles.footer}>
          {!hasScrolledToBottom && (
            <View style={styles.scrollNotice}>
              <Ionicons name="arrow-down" size={16} color={COLORS.primary} />
              <Text style={styles.scrollText}>Scroll to read all terms</Text>
            </View>
          )}

          <View style={styles.checkboxRow}>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => setAgreed(!agreed)}
            >
              {agreed && <Ionicons name="checkmark" size={20} color={COLORS.primary} />}
            </TouchableOpacity>
            <Text style={styles.checkboxText}>
              I have read and agree to the Terms and Conditions
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={onDecline}
            >
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.acceptButton, (!agreed || !hasScrolledToBottom) && styles.buttonDisabled]}
              onPress={onAccept}
              disabled={!agreed || !hasScrolledToBottom}
            >
              <LinearGradient
                colors={[COLORS.primary, '#1BC770']}
                style={styles.acceptGradient}
              >
                <Text style={styles.acceptText}>Accept & Continue</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFF" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFF',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  lastUpdated: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  text: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.text,
    fontWeight: '500',
  },
  bold: {
    fontWeight: '800',
    color: COLORS.text,
  },
  declaration: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#F59E0B',
    marginTop: 8,
  },
  declarationText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  scrollNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    padding: 12,
    backgroundColor: COLORS.primary + '10',
    borderRadius: 12,
  },
  scrollText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: COLORS.border,
  },
  declineText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  acceptButton: {
    flex: 2,
    borderRadius: 16,
    overflow: 'hidden',
  },
  acceptGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  acceptText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginRight: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
