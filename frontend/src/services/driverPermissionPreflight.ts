/**
 * Driver permission pre-flight — run BEFORE GO ONLINE, never mid-connection.
 * Android: location, notifications, SYSTEM_ALERT_WINDOW, battery optimization.
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import {
  DriverOnlineErrorCode,
  type DriverOnlineErrorCode as ErrorCode,
  messageForDriverOnlineError,
} from '@/src/constants/driverOnlineErrors';
import {
  hasNativeBatteryOptimizationExempt,
  hasNativeOverlayPermission,
  requestNativeBatteryOptimizationExempt,
  requestNativeOverlayPermission,
} from '@/src/services/driverNativeExperience';

export type DriverPermissionKey =
  | 'location'
  | 'background_location'
  | 'notifications'
  | 'overlay'
  | 'battery';

export type DriverPermissionItem = {
  key: DriverPermissionKey;
  label: string;
  granted: boolean;
  required: boolean;
  code: ErrorCode;
  /** Open system settings / request this permission. */
  request: () => Promise<void>;
};

export type DriverPermissionPreflight = {
  items: DriverPermissionItem[];
  ready: boolean;
  missing: DriverPermissionItem[];
  firstBlockingCode: ErrorCode | null;
};

async function ensureForegroundLocation(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  const next = await Location.requestForegroundPermissionsAsync();
  return next.granted;
}

async function ensureBackgroundLocation(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) return false;
  const current = await Location.getBackgroundPermissionsAsync();
  if (current.granted) return true;
  // Play User Data policy: prominent in-app disclosure + consent BEFORE the
  // system BACKGROUND_LOCATION / "Allow all the time" dialog.
  const { promptBackgroundLocationDisclosure } = await import(
    '@/src/services/backgroundLocationDisclosure'
  );
  const accepted = await promptBackgroundLocationDisclosure();
  if (!accepted) return false;
  // Android 10+: must request after foreground is granted.
  const next = await Location.requestBackgroundPermissionsAsync();
  return next.granted;
}

async function ensureNotifications(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

export async function evaluateDriverPermissionPreflight(): Promise<DriverPermissionPreflight> {
  if (Platform.OS === 'web') {
    return { items: [], ready: true, missing: [], firstBlockingCode: null };
  }

  const [fgLoc, bgLoc, notif] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
  ]);

  const overlayGranted =
    Platform.OS !== 'android' ? true : await hasNativeOverlayPermission().catch(() => false);
  const batteryExempt =
    Platform.OS !== 'android' ? true : await hasNativeBatteryOptimizationExempt().catch(() => true);

  const items: DriverPermissionItem[] = [
    {
      key: 'location',
      label: 'Location (precise)',
      granted: !!fgLoc.granted,
      required: true,
      code: DriverOnlineErrorCode.ERR_LOCATION,
      request: async () => {
        await ensureForegroundLocation();
      },
    },
    {
      key: 'background_location',
      label: 'Location while using / background',
      granted: !!bgLoc.granted,
      // Soft on iOS (Always is often deferred); hard on Android for FGS reliability.
      required: Platform.OS === 'android',
      code: DriverOnlineErrorCode.ERR_LOCATION,
      request: async () => {
        await ensureForegroundLocation();
        await ensureBackgroundLocation();
      },
    },
    {
      key: 'notifications',
      label: 'Notifications',
      granted: !!notif.granted,
      required: true,
      code: DriverOnlineErrorCode.ERR_NOTIFICATIONS,
      request: async () => {
        await ensureNotifications();
      },
    },
  ];

  if (Platform.OS === 'android') {
    items.push({
      key: 'overlay',
      label: 'Display over other apps (Driver Bubble)',
      granted: overlayGranted,
      required: true,
      code: DriverOnlineErrorCode.ERR_OVERLAY_PERMISSION,
      request: async () => {
        requestNativeOverlayPermission();
      },
    });
    items.push({
      key: 'battery',
      label: 'Battery unrestricted',
      granted: batteryExempt,
      // Recommended for Lagos Doze reliability; do not hard-block go-online if OEM denies.
      required: false,
      code: DriverOnlineErrorCode.ERR_BATTERY_OPTIMIZATION,
      request: async () => {
        requestNativeBatteryOptimizationExempt();
      },
    });
  }

  const missing = items.filter((i) => i.required && !i.granted);
  return {
    items,
    ready: missing.length === 0,
    missing,
    firstBlockingCode: missing[0]?.code ?? null,
  };
}

/** Request every missing required permission in order (overlay opens Settings). */
export async function requestMissingDriverPermissions(
  preflight: DriverPermissionPreflight,
): Promise<DriverPermissionPreflight> {
  for (const item of preflight.missing) {
    try {
      await item.request();
    } catch {
      /* continue checklist */
    }
  }
  // Overlay / battery open Settings — re-evaluate after a short settle.
  await new Promise((r) => setTimeout(r, 400));
  return evaluateDriverPermissionPreflight();
}

export function preflightBlockingMessage(preflight: DriverPermissionPreflight): string {
  if (preflight.ready) return '';
  const code = preflight.firstBlockingCode ?? DriverOnlineErrorCode.ERR_UNKNOWN;
  const names = preflight.missing.map((m) => m.label).join(', ');
  return `${messageForDriverOnlineError(code)} Grant: ${names}.`;
}
