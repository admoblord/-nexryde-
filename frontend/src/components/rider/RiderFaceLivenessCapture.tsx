/**
 * OPay-style two-frame biometric capture: primary pose + movement probe for backend template similarity.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type CameraMountError } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const MINT = '#34D399';

async function pictureToDataUrl(uri: string, base64?: string | null): Promise<string | null> {
  if (base64) return base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    return null;
  }
}

type Phase = 'permission' | 'intro' | 'countdown' | 'between' | 'upload';

export type RiderFaceLivenessCaptureProps = {
  visible: boolean;
  onClose: () => void;
  /** Called with primary data URL + probe data URL */
  onPairCaptured: (primaryDataUrl: string, probeDataUrl: string) => Promise<void>;
};

export function RiderFaceLivenessCapture({ visible, onClose, onPairCaptured }: RiderFaceLivenessCaptureProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const camRef = useRef<CameraView>(null);
  const primaryRef = useRef<string | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [camReady, setCamReady] = useState(false);
  const [phase, setPhase] = useState<Phase>('permission');
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const clearCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const reset = useCallback(() => {
    clearCountdown();
    setPhase('permission');
    setCount(3);
    setBusy(false);
    setErr(null);
    setCamReady(false);
    primaryRef.current = null;
  }, []);

  useEffect(() => {
    if (!visible) {
      reset();
      return;
    }
    if (permission?.granted) setPhase('intro');
    else setPhase('permission');
  }, [visible, permission?.granted, reset]);

  useEffect(() => () => clearCountdown(), []);

  const snapPrimary = useCallback(async () => {
    setBusy(true);
    setErr(null);
    clearCountdown();
    try {
      const cam = camRef.current;
      if (!cam) throw new Error('Camera not ready');
      const pic = await cam.takePictureAsync({ base64: true, quality: 0.82 });
      if (!pic?.uri) throw new Error('Could not capture photo');
      const primary = await pictureToDataUrl(pic.uri, pic.base64 ?? null);
      if (!primary) throw new Error('Could not read capture');
      primaryRef.current = primary;
      setBusy(false);
      setPhase('between');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      setBusy(false);
      setErr(e instanceof Error ? e.message : 'Capture failed');
      setPhase('intro');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, []);

  const snapProbe = async () => {
    setBusy(true);
    setErr(null);
    try {
      const cam = camRef.current;
      if (!cam) throw new Error('Camera not ready');
      const pic = await cam.takePictureAsync({ base64: true, quality: 0.82 });
      if (!pic?.uri) throw new Error('Could not capture photo');
      const probe = await pictureToDataUrl(pic.uri, pic.base64 ?? null);
      const primary = primaryRef.current;
      if (!probe || !primary) throw new Error('Missing frames');
      setPhase('upload');
      await onPairCaptured(primary, probe);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      primaryRef.current = null;
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Verification failed';
      setErr(msg);
      setPhase('between');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  const startCountdown = () => {
    setErr(null);
    clearCountdown();
    setPhase('countdown');
    setCount(3);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    let n = 3;
    countdownRef.current = setInterval(() => {
      n -= 1;
      setCount(Math.max(0, n));
      if (n <= 0) {
        clearCountdown();
        void snapPrimary();
      }
    }, 900);
  };

  const onMountError = useCallback((event: CameraMountError) => {
    const msg = event?.message || 'Camera could not start';
    setErr(msg);
    setCamReady(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, []);

  const requestCam = async () => {
    setErr(null);
    const res = await requestPermission();
    if (!res.granted) {
      setErr('Camera permission is required. You can enable it in system settings.');
    }
  };

  const panel = Math.min(420, height * 0.72);

  if (!visible) return null;

  const showCamera = permission?.granted === true;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        {showCamera ? (
          <CameraView
            ref={camRef}
            style={StyleSheet.absoluteFill}
            facing="front"
            mode="picture"
            onCameraReady={() => setCamReady(true)}
            onMountError={onMountError}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.cameraPlaceholder]} />
        )}

        <View style={styles.darkVeil} pointerEvents="none" />
        <SafeAreaView style={styles.safe}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.iconBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={26} color="#F8FAFC" />
            </TouchableOpacity>
            <Text style={styles.topTitle}>Biometric verification</Text>
            <View style={{ width: 44 }} />
          </View>

          <View style={[styles.faceHoleWrap, { height: panel }]}>
            <View style={styles.ovalGuide} />
          </View>

          <View style={[styles.sheet, { paddingBottom: Math.max(28, 12 + insets.bottom) }]}>
            {phase === 'permission' && !permission?.granted ? (
              <>
                <Text style={styles.sheetTitle}>Camera access</Text>
                <Text style={styles.sheetBody}>We use your camera only for a protected onboarding selfie — similar to banking apps.</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => void requestCam()} accessibilityRole="button">
                  <Text style={styles.primaryBtnTxt}>Allow camera</Text>
                </TouchableOpacity>
                {permission && !permission.granted && !permission.canAskAgain ? (
                  <TouchableOpacity style={styles.linkBtn} onPress={() => void Linking.openSettings()} accessibilityRole="button">
                    <Text style={styles.linkBtnTxt}>Open settings</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}

            {permission?.granted && phase === 'intro' ? (
              <>
                <Text style={styles.sheetTitle}>Live face scan</Text>
                <Text style={styles.sheetBody}>
                  Remove hats or sunglasses. We capture two quick frames to confirm it&apos;s really you — not a photo of a photo.
                </Text>
                <View style={styles.steps}>
                  <View style={styles.stepRow}>
                    <View style={styles.stepDot} />
                    <Text style={styles.stepTxt}>Frame 1 — hold steady when the timer finishes</Text>
                  </View>
                  <View style={styles.stepRow}>
                    <View style={styles.stepDot} />
                    <Text style={styles.stepTxt}>Frame 2 — move slightly closer, then tap capture</Text>
                  </View>
                </View>
                {!camReady ? (
                  <ActivityIndicator color={MINT} style={{ marginVertical: 12 }} />
                ) : (
                  <TouchableOpacity
                    style={[styles.primaryBtn, busy && styles.primaryBtnOff]}
                    disabled={busy || !camReady}
                    onPress={startCountdown}
                    accessibilityRole="button"
                    accessibilityLabel="Start biometric scan"
                  >
                    <Text style={styles.primaryBtnTxt}>{busy ? 'Please wait…' : 'Start scan'}</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : null}

            {phase === 'countdown' ? (
              <View style={styles.countBlock}>
                <Text style={styles.countLabel}>Hold still</Text>
                <Text style={styles.countNum}>{count > 0 ? count : '…'}</Text>
                <ActivityIndicator color={MINT} style={{ marginTop: 8 }} />
              </View>
            ) : null}

            {phase === 'between' ? (
              <>
                <Text style={styles.sheetTitle}>Almost done</Text>
                <Text style={styles.sheetBody}>Move a little closer to the lens — change distance slightly — then capture frame two.</Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, busy && styles.primaryBtnOff]}
                  disabled={busy}
                  onPress={() => void snapProbe()}
                  accessibilityRole="button"
                  accessibilityLabel="Capture second frame"
                >
                  <Text style={styles.primaryBtnTxt}>{busy ? 'Saving…' : 'Capture frame 2'}</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {phase === 'upload' ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <ActivityIndicator color={MINT} size="large" />
                <Text style={[styles.sheetBody, { marginTop: 12 }]}>Securing your biometric…</Text>
              </View>
            ) : null}

            {err ? (
              <View style={styles.errBox}>
                <Ionicons name="alert-circle" size={18} color="#FCA5A5" />
                <Text style={styles.err}>{err}</Text>
              </View>
            ) : null}

            {Platform.OS === 'web' ? (
              <Text style={styles.webHint}>Live biometric scanning works best in the native Nexryde app.</Text>
            ) : null}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: '#020617' },
  cameraPlaceholder: { backgroundColor: '#020617' },
  darkVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.35)',
  },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  topTitle: { color: '#E2E8F0', fontWeight: '800', fontSize: 15 },
  faceHoleWrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ovalGuide: {
    width: '72%',
    aspectRatio: 3 / 4,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'rgba(52,211,153,0.85)',
    backgroundColor: 'transparent',
  },
  sheet: {
    paddingHorizontal: 22,
    paddingTop: 8,
    backgroundColor: 'rgba(15,23,42,0.94)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: 'rgba(52,211,153,0.22)',
  },
  sheetTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  sheetBody: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 10, lineHeight: 21 },
  steps: { marginTop: 14, gap: 10 },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: MINT,
    marginTop: 6,
  },
  stepTxt: { flex: 1, color: '#CBD5E1', fontSize: 13, fontWeight: '600', lineHeight: 19 },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: MINT,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnOff: { opacity: 0.55 },
  primaryBtnTxt: { color: '#022C22', fontWeight: '900', fontSize: 16 },
  linkBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  linkBtnTxt: { color: '#38BDF8', fontWeight: '800', fontSize: 14 },
  countBlock: { alignItems: 'center', paddingVertical: 18 },
  countLabel: { color: '#94A3B8', fontWeight: '700', fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase' },
  countNum: { color: '#F8FAFC', fontSize: 72, fontWeight: '900', marginTop: 4 },
  errBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 },
  err: { color: '#FCA5A5', fontWeight: '700', fontSize: 13, flex: 1, lineHeight: 18 },
  webHint: { marginTop: 14, color: '#64748B', fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
