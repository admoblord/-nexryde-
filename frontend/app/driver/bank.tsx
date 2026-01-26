import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Card, Button } from '@/src/components/UI';
import { useAppStore } from '@/src/store/appStore';

export default function BankScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  const handleSave = async () => {
    if (!bankName || !accountNumber || !accountName) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    // In a real app, save to backend
    setTimeout(() => {
      setLoading(false);
      Alert.alert('Success', 'Bank details saved successfully');
    }, 1000);
  };

  const banks = [
    'Access Bank',
    'First Bank',
    'GTBank',
    'UBA',
    'Zenith Bank',
    'Kuda Bank',
    'Opay',
    'Palmpay',
    'Wema Bank',
    'Fidelity Bank',
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Bank Details</Text>
        </View>

        {/* Info Card */}
        <Card style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color={COLORS.info} />
          <Text style={styles.infoText}>
            Riders will transfer payments directly to your bank account. Make sure your details are correct.
          </Text>
        </Card>

        {/* Bank Selection */}
        <Text style={styles.label}>Select Bank</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bankScroll}>
          {banks.map((bank) => (
            <TouchableOpacity
              key={bank}
              style={[
                styles.bankOption,
                bankName === bank && styles.bankOptionSelected
              ]}
              onPress={() => setBankName(bank)}
            >
              <Text style={[
                styles.bankText,
                bankName === bank && styles.bankTextSelected
              ]}>{bank}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Account Number */}
        <Text style={styles.label}>Account Number</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your 10-digit account number"
          placeholderTextColor={COLORS.gray400}
          value={accountNumber}
          onChangeText={setAccountNumber}
          keyboardType="number-pad"
          maxLength={10}
        />

        {/* Account Name */}
        <Text style={styles.label}>Account Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter account holder name"
          placeholderTextColor={COLORS.gray400}
          value={accountName}
          onChangeText={setAccountName}
          autoCapitalize="words"
        />

        {/* Preview Card */}
        {bankName && accountNumber && accountName && (
          <Card style={styles.previewCard}>
            <Text style={styles.previewTitle}>Payment Details Preview</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Bank:</Text>
              <Text style={styles.previewValue}>{bankName}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Account Number:</Text>
              <Text style={styles.previewValue}>{accountNumber}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Account Name:</Text>
              <Text style={styles.previewValue}>{accountName}</Text>
            </View>
            <Text style={styles.previewNote}>
              Riders will see these details when paying via bank transfer
            </Text>
          </Card>
        )}

        <Button
          title={loading ? 'Saving...' : 'Save Bank Details'}
          onPress={handleSave}
          loading={loading}
          disabled={!bankName || !accountNumber || !accountName}
          style={styles.saveButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    ...SHADOWS.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.info + '15',
  },
  infoText: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.info,
    lineHeight: 22,
  },
  label: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  bankScroll: {
    marginBottom: SPACING.lg,
  },
  bankOption: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    marginRight: SPACING.sm,
  },
  bankOptionSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  bankText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  bankTextSelected: {
    color: COLORS.white,
  },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
  },
  previewCard: {
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.primary + '10',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  previewTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: SPACING.md,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  previewLabel: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  previewValue: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  previewNote: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  saveButton: {
    marginTop: 'auto',
  },
});
