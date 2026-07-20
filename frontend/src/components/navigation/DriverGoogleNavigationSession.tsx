/**
 * Uber-class in-app driver navigation powered by Google Navigation SDK.
 * Falls back gracefully when the native module / license is unavailable.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BRAND } from '@/src/constants/designSystem';
import { promptExternalNavigation } from '@/src/utils/openExternalNavigation';

export type DriverNavDestination = {
  lat: number;
  lng: number;
  label?: string;
};

type Props = {
  destination: DriverNavDestination;
  onClose: () => void;
  onUnavailable?: (reason: string) => void;
};

type NavSdk = typeof import('@googlemaps/react-native-navigation-sdk');

function loadNavSdk(): NavSdk | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@googlemaps/react-native-navigation-sdk') as NavSdk;
  } catch {
    return null;
  }
}

function DriverNavInner({ destination, onClose, onUnavailable, sdk }: Props & { sdk: NavSdk }) {
  const insets = useSafeAreaInsets();
  const {
    NavigationView,
    useNavigation,
    TravelMode,
    NavigationNightMode,
    NavigationSessionStatus,
  } = sdk;
  const { navigationController } = useNavigation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const startGuidance = useCallback(async () => {
    if (startedRef.current) return;
    try {
      const accepted = await navigationController.showTermsAndConditionsDialog();
      if (!accepted) {
        setError('Navigation terms were declined.');
        onUnavailable?.('terms_declined');
        return;
      }
      const status = await navigationController.init();
      const ok = status === NavigationSessionStatus.OK;
      if (!ok) {
        const statusLabel = String(status);
        setError(
          `Navigation init failed (${statusLabel}). Enable Navigation SDK billing/SKU on your Google Cloud key.`,
        );
        onUnavailable?.(statusLabel);
        return;
      }

      await navigationController.setDestinations(
        [
          {
            title: destination.label || 'Destination',
            position: { lat: destination.lat, lng: destination.lng },
          },
        ],
        {
          routingOptions: { travelMode: TravelMode.DRIVING },
          displayOptions: {
            showDestinationMarkers: true,
            showStopSigns: true,
            showTrafficLights: true,
          },
        },
      );
      await navigationController.startGuidance();
      startedRef.current = true;
      setReady(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not start Google Navigation';
      setError(msg);
      onUnavailable?.(msg);
    }
  }, [destination, navigationController, onUnavailable, TravelMode, NavigationSessionStatus]);

  useEffect(() => {
    void startGuidance();
    return () => {
      try {
        void navigationController.stopGuidance?.();
        void navigationController.clearDestinations?.();
      } catch {
        /* session teardown best-effort */
      }
    };
  }, [startGuidance, navigationController]);

  return (
    <View style={styles.root}>
      <NavigationView
        style={StyleSheet.absoluteFillObject}
        navigationNightMode={NavigationNightMode?.AUTO ?? NavigationNightMode?.FORCE_NIGHT}
        tripProgressBarEnabled
        headerEnabled
        footerEnabled
        trafficPromptsEnabled
        trafficIncidentCardsEnabled
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close navigation">
          <Ionicons name="close" size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <Ionicons name="navigate" size={14} color={BRAND.primary} />
          <Text style={styles.badgeTxt}>Google Navigation</Text>
        </View>
      </View>

      {!ready && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={BRAND.primary} />
          <Text style={styles.loadingTxt}>Starting turn-by-turn…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.errorCard, { bottom: insets.bottom + 16 }]}>
          <Text style={styles.errorTitle}>In-app navigation unavailable</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <TouchableOpacity
            style={styles.externalBtn}
            onPress={() => {
              promptExternalNavigation({
                lat: destination.lat,
                lng: destination.lng,
                label: destination.label || 'Destination',
              });
              onClose();
            }}
          >
            <Text style={styles.externalBtnTxt}>Open Google Maps / Waze</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

export function DriverGoogleNavigationSession(props: Props) {
  const sdk = loadNavSdk();
  if (!sdk?.NavigationProvider || !sdk?.NavigationView) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.errorTitle}>Google Navigation SDK not linked</Text>
        <Text style={styles.errorBody}>
          Rebuild a native EAS binary after enabling Navigation SDK on your Google Cloud project.
        </Text>
        <TouchableOpacity
          style={styles.externalBtn}
          onPress={() => {
            promptExternalNavigation({
              lat: props.destination.lat,
              lng: props.destination.lng,
              label: props.destination.label || 'Destination',
            });
            props.onClose();
          }}
        >
          <Text style={styles.externalBtnTxt}>Open external navigation</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { NavigationProvider, TaskRemovedBehavior } = sdk;

  return (
    <NavigationProvider
      termsAndConditionsDialogOptions={{
        title: 'NexRyde Navigation',
        companyName: 'NexRyde',
        showOnlyDisclaimer: true,
      }}
      taskRemovedBehavior={TaskRemovedBehavior?.CONTINUE_SERVICE}
    >
      <DriverNavInner {...props} sdk={sdk} />
    </NavigationProvider>
  );
}

export function openDriverInAppNavigationOrExternal(
  dest: DriverNavDestination,
  openInApp: () => void,
) {
  if (Platform.OS === 'web') {
    promptExternalNavigation(dest);
    return;
  }
  try {
    openInApp();
  } catch {
    Alert.alert('Navigation', 'Could not open in-app navigation. Using Google Maps instead.', [
      {
        text: 'Continue',
        onPress: () => promptExternalNavigation(dest),
      },
    ]);
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0c1220' },
  fallback: {
    flex: 1,
    backgroundColor: '#0c1220',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 20,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(8,13,24,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(8,13,24,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.28)',
  },
  badgeTxt: { color: '#E2E8F0', fontSize: 12, fontWeight: '800' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,11,20,0.45)',
    gap: 10,
  },
  loadingTxt: { color: '#E2E8F0', fontWeight: '700' },
  errorCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(8,13,24,0.96)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    gap: 8,
  },
  errorTitle: { color: '#FECACA', fontSize: 15, fontWeight: '800' },
  errorBody: { color: '#CBD5E1', fontSize: 12, lineHeight: 18 },
  externalBtn: {
    marginTop: 6,
    backgroundColor: BRAND.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  externalBtnTxt: { color: '#041016', fontWeight: '900', fontSize: 13 },
});
