import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function WalletScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [referralCode, setReferralCode] = useState('');

  useEffect(() => {
    loadWallet();
    loadReferralCode();
  }, []);

  const loadWallet = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/wallet/${user.id}`);
      const data = await res.json();
      setBalance(data.balance || 0);
    } catch (e) {
      console.error('Load wallet error:', e);
    }
    setLoading(false);
  };

  const loadReferralCode = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/referral/code/${user.id}`);
      const data = await res.json();
      setReferralCode(data.referral_code || '');
    } catch (e) {
      console.error('Load referral error:', e);
    }
  };

  const handleTopup = async () => {
    if (!user?.id || !topupAmount) return;
    
    const amount = parseFloat(topupAmount);
    if (amount < 100) {
      Alert.alert('Error', 'Minimum top-up is ₦100');
      return;
    }
    
    setTopupLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/wallet/${user.id}/topup?amount=${amount}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setBalance(data.new_balance);
        setShowTopup(false);
        setTopupAmount('');
        Alert.alert('Success', `₦${amount.toLocaleString()} added to your wallet`);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to top up');
    }
    setTopupLoading(false);
  };

  const quickAmounts = [500, 1000, 2000, 5000, 10000];

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#1E293B']} style={StyleSheet.absoluteFill} />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rewards</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Balance Card */}
          <LinearGradient
            colors={['#6366F1', '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balanceCard}
          >
            <Text style={styles.balanceLabel}>Reward Balance</Text>
            <Text style={styles.balanceAmount}>
              {loading ? '...' : `₦${balance.toLocaleString()}`}
            </Text>
            
            <TouchableOpacity 
              style={styles.topupBtn}
              onPress={() => setShowTopup(true)}
            >
              <Ionicons name="add" size={20} color="#6366F1" />
              <Text style={styles.topupBtnText}>Top Up</Text>
            </TouchableOpacity>
          </LinearGradient>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: 'rgba(0,230,118,0.15)' }]}>
                <Ionicons name="send" size={22} color="#00E676" />
              </View>
              <Text style={styles.actionText}>Transfer</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                <Ionicons name="receipt" size={22} color="#F59E0B" />
              </View>
              <Text style={styles.actionText}>History</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                <Ionicons name="card" size={22} color="#EF4444" />
              </View>
              <Text style={styles.actionText}>Cards</Text>
            </TouchableOpacity>
          </View>

          {/* Referral Card */}
          <View style={styles.referralCard}>
            <View style={styles.referralHeader}>
              <View style={styles.referralIcon}>
                <Ionicons name="gift" size={24} color="#8B5CF6" />
              </View>
              <View>
                <Text style={styles.referralTitle}>Invite Friends</Text>
                <Text style={styles.referralSubtitle}>Earn ₦500 per referral</Text>
              </View>
            </View>
            
            {referralCode && (
              <View style={styles.referralCodeBox}>
                <Text style={styles.referralCodeLabel}>Your Code</Text>
                <Text style={styles.referralCode}>{referralCode}</Text>
                <TouchableOpacity style={styles.copyBtn}>
                  <Ionicons name="copy-outline" size={18} color="#8B5CF6" />
                </TouchableOpacity>
              </View>
            )}
            
            <TouchableOpacity style={styles.shareBtn}>
              <Ionicons name="share-social" size={18} color="#FFFFFF" />
              <Text style={styles.shareBtnText}>Share Link</Text>
            </TouchableOpacity>
          </View>

          {/* Promo Code */}
          <View style={styles.promoCard}>
            <Text style={styles.promoTitle}>Have a promo code?</Text>
            <View style={styles.promoInputRow}>
              <TextInput
                style={styles.promoInput}
                placeholder="Enter code"
                placeholderTextColor="#64748B"
              />
              <TouchableOpacity style={styles.promoApplyBtn}>
                <Text style={styles.promoApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Topup Modal */}
        {showTopup && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Top Up Wallet</Text>
                <TouchableOpacity onPress={() => setShowTopup(false)}>
                  <Ionicons name="close" size={24} color="#94A3B8" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.amountInputContainer}>
                <Text style={styles.currencyPrefix}>₦</Text>
                <TextInput
                  style={styles.amountInput}
                  value={topupAmount}
                  onChangeText={setTopupAmount}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#64748B"
                />
              </View>
              
              <View style={styles.quickAmounts}>
                {quickAmounts.map(amt => (
                  <TouchableOpacity
                    key={amt}
                    style={[
                      styles.quickAmtBtn,
                      topupAmount === amt.toString() && styles.quickAmtBtnActive
                    ]}
                    onPress={() => setTopupAmount(amt.toString())}
                  >
                    <Text style={[
                      styles.quickAmtText,
                      topupAmount === amt.toString() && styles.quickAmtTextActive
                    ]}>₦{amt.toLocaleString()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <TouchableOpacity 
                style={styles.confirmBtn}
                onPress={handleTopup}
                disabled={topupLoading}
              >
                {topupLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmBtnText}>Top Up</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  content: { flex: 1, padding: 16 },
  balanceCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  balanceLabel: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  balanceAmount: { fontSize: 42, fontWeight: '800', color: '#FFFFFF', marginTop: 8 },
  topupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 20,
    gap: 6,
  },
  topupBtnText: { fontSize: 14, fontWeight: '700', color: '#6366F1' },
  quickActions: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  referralCard: {
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  referralHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  referralIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(139,92,246,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  referralSubtitle: { fontSize: 13, color: '#A5B4FC', marginTop: 2 },
  referralCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  referralCodeLabel: { fontSize: 11, color: '#94A3B8', marginRight: 10 },
  referralCode: { flex: 1, fontSize: 18, fontWeight: '800', color: '#FFFFFF', letterSpacing: 2 },
  copyBtn: { padding: 8 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  shareBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  promoCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  promoTitle: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', marginBottom: 12 },
  promoInputRow: { flexDirection: 'row', gap: 10 },
  promoInput: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
  },
  promoApplyBtn: {
    backgroundColor: '#00E676',
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  promoApplyText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  // Modal
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  currencyPrefix: { fontSize: 32, fontWeight: '700', color: '#00E676', marginRight: 4 },
  amountInput: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    minWidth: 120,
    textAlign: 'center',
  },
  quickAmounts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  quickAmtBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  quickAmtBtnActive: { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: '#6366F1' },
  quickAmtText: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  quickAmtTextActive: { color: '#A5B4FC' },
  confirmBtn: {
    backgroundColor: '#00E676',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
});
