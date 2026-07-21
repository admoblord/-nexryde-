/**
 * Structured driver go-online error codes — never show a vague
 * "Check your connection" when the real cause is known.
 */

export const DriverOnlineErrorCode = {
  ERR_OVERLAY_PERMISSION: 'ERR_OVERLAY_PERMISSION',
  ERR_LOCATION: 'ERR_LOCATION',
  ERR_NOTIFICATIONS: 'ERR_NOTIFICATIONS',
  ERR_BATTERY_OPTIMIZATION: 'ERR_BATTERY_OPTIMIZATION',
  ERR_NO_VEHICLE: 'ERR_NO_VEHICLE',
  ERR_NO_ACTIVE_PLAN: 'ERR_NO_ACTIVE_PLAN',
  ERR_AUTH: 'ERR_AUTH',
  ERR_SOCKET: 'ERR_SOCKET',
  ERR_NETWORK: 'ERR_NETWORK',
  ERR_APPROVAL: 'ERR_APPROVAL',
  ERR_DOCUMENTS: 'ERR_DOCUMENTS',
  ERR_UNKNOWN: 'ERR_UNKNOWN',
} as const;

export type DriverOnlineErrorCode =
  (typeof DriverOnlineErrorCode)[keyof typeof DriverOnlineErrorCode];

const CODE_MESSAGES: Record<DriverOnlineErrorCode, string> = {
  ERR_OVERLAY_PERMISSION:
    'Enable Display over other apps so ride requests can appear as a driver bubble.',
  ERR_LOCATION: 'Allow location access so riders can see you nearby.',
  ERR_NOTIFICATIONS: 'Allow notifications so you never miss a ride request.',
  ERR_BATTERY_OPTIMIZATION:
    'Turn off battery optimization for NEXRYDE so listening for rides stays reliable.',
  ERR_NO_VEHICLE: 'Register a vehicle in Driver Profile before going online.',
  ERR_NO_ACTIVE_PLAN: 'Start your free trial or subscribe to receive trips.',
  ERR_AUTH: 'Your session expired. Sign in again, then go online.',
  ERR_SOCKET: 'Could not connect to the ride network. Tap GO to retry.',
  ERR_NETWORK: 'Network request failed. Check LTE/Wi‑Fi, then tap GO to retry.',
  ERR_APPROVAL: 'Your account is still under review. You can go online after approval.',
  ERR_DOCUMENTS: 'Update expired documents before going online.',
  ERR_UNKNOWN: 'Couldn’t go online. Tap GO to retry.',
};

export function messageForDriverOnlineError(code: DriverOnlineErrorCode): string {
  return CODE_MESSAGES[code] ?? CODE_MESSAGES.ERR_UNKNOWN;
}

/** Extract structured code from API detail (string or `{ code, message }`). */
export function parseDriverOnlineError(
  detail: unknown,
  httpStatus?: number | null,
): { code: DriverOnlineErrorCode; message: string } {
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const o = detail as Record<string, unknown>;
    const raw = typeof o.code === 'string' ? o.code.trim().toUpperCase() : '';
    if (raw in DriverOnlineErrorCode) {
      const code = raw as DriverOnlineErrorCode;
      const message =
        typeof o.message === 'string' && o.message.trim()
          ? o.message.trim()
          : messageForDriverOnlineError(code);
      return { code, message };
    }
    if (typeof o.message === 'string' && o.message.trim()) {
      return classifyDriverOnlineDetail(o.message, httpStatus);
    }
  }
  if (typeof detail === 'string' && detail.trim()) {
    return classifyDriverOnlineDetail(detail, httpStatus);
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { code: 'ERR_AUTH', message: messageForDriverOnlineError('ERR_AUTH') };
  }
  return { code: 'ERR_NETWORK', message: messageForDriverOnlineError('ERR_NETWORK') };
}

export function classifyDriverOnlineDetail(
  detail: string,
  httpStatus?: number | null,
): { code: DriverOnlineErrorCode; message: string } {
  const lower = detail.toLowerCase();
  if (lower.includes('vehicle')) {
    return { code: 'ERR_NO_VEHICLE', message: detail };
  }
  if (
    lower.includes('subscription') ||
    lower.includes('no active plan') ||
    lower.includes('trial has ended') ||
    lower.includes('subscribe')
  ) {
    return { code: 'ERR_NO_ACTIVE_PLAN', message: detail };
  }
  if (lower.includes('expired') || lower.includes('document')) {
    return { code: 'ERR_DOCUMENTS', message: detail };
  }
  if (
    lower.includes('approval') ||
    lower.includes('pending') ||
    lower.includes('not yet approved') ||
    lower.includes('verification')
  ) {
    return { code: 'ERR_APPROVAL', message: detail };
  }
  if (
    lower.includes('session') ||
    lower.includes('unauthorized') ||
    lower.includes('token') ||
    httpStatus === 401
  ) {
    return { code: 'ERR_AUTH', message: detail };
  }
  if (lower.includes('overlay') || lower.includes('display over')) {
    return { code: 'ERR_OVERLAY_PERMISSION', message: detail };
  }
  if (lower.includes('location') || lower.includes('gps')) {
    return { code: 'ERR_LOCATION', message: detail };
  }
  if (lower.includes('socket') || lower.includes('websocket')) {
    return { code: 'ERR_SOCKET', message: detail };
  }
  if (httpStatus != null && httpStatus >= 500) {
    return { code: 'ERR_NETWORK', message: messageForDriverOnlineError('ERR_NETWORK') };
  }
  return { code: 'ERR_UNKNOWN', message: detail || messageForDriverOnlineError('ERR_UNKNOWN') };
}
