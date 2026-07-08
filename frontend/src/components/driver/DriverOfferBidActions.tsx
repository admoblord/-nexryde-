/**
 * InDrive-style stable bid actions for driver offers.
 * - Accept rider price and counter bid are always separate buttons (never morph).
 * - Fixed footer height — no layout jump when opening bid editor.
 * - Quick ₦ increments for one-tap rebid on shaky phones.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const G = '#00D47E';
const AMB = '#F59E0B';
const MUT = '#64748B';
const TXT = '#F1F5F9';

const NGN_STEPS = [50, 100, 200, 500] as const;
const PCT_STEPS = [0.05, 0.1, 0.15] as const;

function parseFare(raw: string): number {
  const n = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function fmt(n: number): string {
  return `₦${Math.round(n).toLocaleString()}`;
}

function roundFare(n: number): number {
  return Math.max(0, Math.round(n / 50) * 50);
}

function suggestedCounter(riderOffer: number, minFare?: number | null): number {
  if (riderOffer <= 0) return 0;
  let next = roundFare(riderOffer * 1.1);
  if (minFare != null && minFare > 0) next = Math.max(next, minFare);
  return Math.max(next, riderOffer + 50);
}

export type DriverOfferBidActionsProps = {
  riderOffer: number;
  minFare?: number | null;
  maxFare?: number | null;
  fareInput: string;
  onFareInputChange: (v: string) => void;
  accepting: boolean;
  offerExpired: boolean;
  onAcceptRiderPrice: () => void;
  onSendCounterPrice: () => void;
  onDecline?: () => void;
  /** Hide decline row (modal has its own ignore elsewhere) */
  showDecline?: boolean;
};

export function DriverOfferBidActions({
  riderOffer,
  minFare,
  maxFare,
  fareInput,
  onFareInputChange,
  accepting,
  offerExpired,
  onAcceptRiderPrice,
  onSendCounterPrice,
  onDecline,
  showDecline = true,
}: DriverOfferBidActionsProps) {
  const [bidOpen, setBidOpen] = useState(false);

  const counterParsed = parseFare(fareInput);
  const counterValid =
    Number.isFinite(counterParsed) &&
    counterParsed > riderOffer &&
    (minFare == null || minFare <= 0 || counterParsed >= minFare) &&
    (maxFare == null || maxFare <= 0 || counterParsed <= maxFare);

  const openBidEditor = useCallback(() => {
    if (offerExpired || accepting) return;
    setBidOpen(true);
    if (!fareInput.trim() || parseFare(fareInput) <= riderOffer) {
      const sug = suggestedCounter(riderOffer, minFare);
      if (sug > 0) onFareInputChange(String(sug));
    }
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
  }, [accepting, fareInput, minFare, offerExpired, onFareInputChange, riderOffer]);

  const applyStep = useCallback(
    (addNgn: number) => {
      const base = Number.isFinite(counterParsed) && counterParsed > 0 ? counterParsed : riderOffer;
      let next = roundFare(base + addNgn);
      if (maxFare != null && maxFare > 0) next = Math.min(next, maxFare);
      if (minFare != null && minFare > 0) next = Math.max(next, minFare);
      next = Math.max(next, riderOffer + 1);
      onFareInputChange(String(next));
      if (Platform.OS !== 'web') void Haptics.selectionAsync();
    },
    [counterParsed, maxFare, minFare, onFareInputChange, riderOffer],
  );

  const applyPct = useCallback(
    (pct: number) => {
      const base = riderOffer > 0 ? riderOffer : parseFare(fareInput) || 0;
      if (base <= 0) return;
      let next = roundFare(base * (1 + pct));
      if (maxFare != null && maxFare > 0) next = Math.min(next, maxFare);
      if (minFare != null && minFare > 0) next = Math.max(next, minFare);
      next = Math.max(next, riderOffer + 1);
      onFareInputChange(String(next));
      if (Platform.OS !== 'web') void Haptics.selectionAsync();
    },
    [fareInput, maxFare, minFare, onFareInputChange, riderOffer],
  );

  const bidHint = useMemo(() => {
    if (!Number.isFinite(counterParsed) || counterParsed <= riderOffer) {
      return 'Enter a fare above the rider offer';
    }
    return `Your bid: ${fmt(riderOffer)} → ${fmt(counterParsed)} (+${fmt(counterParsed - riderOffer).slice(1)})`;
  }, [counterParsed, riderOffer]);

  const disabled = accepting || offerExpired;

  return (
    <View style={s.root}>
      {/* Fixed-height bid slot — prevents footer jump */}
      <View style={s.bidSlot}>
        {bidOpen ? (
          <View style={s.bidPanel}>
            <View style={s.bidPanelHead}>
              <Text style={s.bidTitle}>Your price</Text>
              <Pressable
                onPress={() => setBidOpen(false)}
                hitSlop={12}
                accessibilityLabel="Close bid editor"
                style={s.bidClose}
              >
                <Ionicons name="chevron-down" size={18} color={MUT} />
              </Pressable>
            </View>

            <View style={s.chipRow}>
              {NGN_STEPS.map((step) => (
                <Pressable
                  key={step}
                  style={({ pressed }) => [s.chip, pressed && s.chipPressed, disabled && s.chipDisabled]}
                  onPress={() => applyStep(step)}
                  disabled={disabled}
                  hitSlop={4}
                >
                  <Text style={s.chipTxt}>+{fmt(step).slice(1)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={s.chipRow}>
              {PCT_STEPS.map((pct) => (
                <Pressable
                  key={pct}
                  style={({ pressed }) => [s.chip, pressed && s.chipPressed, disabled && s.chipDisabled]}
                  onPress={() => applyPct(pct)}
                  disabled={disabled}
                  hitSlop={4}
                >
                  <Text style={s.chipTxt}>+{Math.round(pct * 100)}%</Text>
                </Pressable>
              ))}
            </View>

            <View style={s.inputRow}>
              <Text style={s.currency}>₦</Text>
              <TextInput
                style={s.input}
                keyboardType="number-pad"
                value={fareInput}
                onChangeText={onFareInputChange}
                editable={!disabled}
                placeholder={String(suggestedCounter(riderOffer, minFare) || riderOffer)}
                placeholderTextColor={MUT}
                selectTextOnFocus
              />
            </View>
            <Text style={[s.hint, counterValid ? s.hintOk : s.hintWarn]}>{bidHint}</Text>

            <Pressable
              style={({ pressed }) => [
                s.sendBidBtn,
                (!counterValid || disabled) && s.btnDisabled,
                pressed && counterValid && !disabled && s.btnPressed,
              ]}
              onPress={() => {
                if (!counterValid || disabled) return;
                if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onSendCounterPrice();
              }}
              disabled={!counterValid || disabled}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={
                counterValid ? `Send counter offer ${fmt(counterParsed)}` : 'Enter a valid counter fare'
              }
            >
              <LinearGradient
                colors={counterValid && !disabled ? ['#FBBF24', '#F59E0B', '#D97706'] : ['#334155', '#334155']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.sendBidGrad}
              >
                {accepting ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={18} color={counterValid ? '#000' : MUT} />
                    <Text style={[s.sendBidTxt, !counterValid && { color: MUT }]}>
                      {offerExpired
                        ? 'Offer expired'
                        : counterValid
                          ? `Send bid · ${fmt(counterParsed)}`
                          : 'Send your bid'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [s.openBidRow, pressed && !disabled && s.btnPressed, disabled && s.btnDisabled]}
            onPress={openBidEditor}
            disabled={disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Set your counter price"
          >
            <Ionicons name="pricetag-outline" size={18} color={AMB} />
            <Text style={s.openBidTxt}>Set your price (counter bid)</Text>
            <Ionicons name="chevron-up" size={16} color={MUT} />
          </Pressable>
        )}
      </View>

      {/* Always-stable accept at rider price */}
      <Pressable
        style={({ pressed }) => [s.acceptBtn, disabled && s.btnDisabled, pressed && !disabled && s.btnPressed]}
        onPress={() => {
          if (disabled) return;
          if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onAcceptRiderPrice();
        }}
        disabled={disabled}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`Accept rider price ${fmt(riderOffer)}`}
      >
        <LinearGradient
          colors={disabled ? ['#334155', '#334155'] : ['#34F5B8', '#22E5A0', '#0D9F6E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.acceptGrad}
        >
          {accepting ? (
            <ActivityIndicator color="#022C22" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#022C22" />
              <Text style={s.acceptTxt}>
                {offerExpired ? 'Offer expired' : `Accept · ${fmt(riderOffer)}`}
              </Text>
            </>
          )}
        </LinearGradient>
      </Pressable>

      {showDecline && onDecline ? (
        <Pressable
          style={({ pressed }) => [s.declineBtn, pressed && s.btnPressed]}
          onPress={() => {
            if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onDecline();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Decline this offer"
        >
          <Ionicons name="close-circle-outline" size={16} color="#EF4444" />
          <Text style={s.declineTxt}>Decline</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 10, minHeight: 168 },
  bidSlot: { minHeight: 52 },
  bidPanel: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    gap: 8,
  },
  bidPanelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bidTitle: { fontSize: 12, fontWeight: '800', color: AMB, letterSpacing: 0.6, textTransform: 'uppercase' },
  bidClose: { padding: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1A2438',
    borderWidth: 1,
    borderColor: '#334155',
    minHeight: 40,
    justifyContent: 'center',
  },
  chipPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  chipDisabled: { opacity: 0.45 },
  chipTxt: { fontSize: 13, fontWeight: '800', color: TXT },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1420',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: AMB,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  currency: { fontSize: 20, fontWeight: '900', color: AMB, marginRight: 6 },
  input: { flex: 1, fontSize: 22, fontWeight: '900', color: TXT, paddingVertical: 8 },
  hint: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  hintOk: { color: G },
  hintWarn: { color: MUT },
  sendBidBtn: { borderRadius: 14, overflow: 'hidden', minHeight: 52 },
  sendBidGrad: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  sendBidTxt: { fontSize: 16, fontWeight: '900', color: '#000' },
  openBidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    backgroundColor: 'rgba(245,158,11,0.08)',
    paddingHorizontal: 14,
  },
  openBidTxt: { flex: 1, fontSize: 14, fontWeight: '800', color: TXT },
  acceptBtn: { borderRadius: 16, overflow: 'hidden', minHeight: 56 },
  acceptGrad: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  acceptTxt: { fontSize: 17, fontWeight: '900', color: '#022C22' },
  declineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingVertical: 10,
  },
  declineTxt: { fontSize: 14, fontWeight: '800', color: '#EF4444' },
  btnDisabled: { opacity: 0.55 },
  btnPressed: { opacity: 0.92 },
});

export { suggestedCounter, parseFare as parseDriverBidFare, fmt as fmtDriverBidFare };
