/** Per-request max wait — never block startup longer than this. */
export const STARTUP_REQUEST_TIMEOUT_MS = 5000;

/** Global watchdog — no gate/spinner may exceed this. */
export const STARTUP_GLOBAL_WATCHDOG_MS = 8000;

/** Optimistic dashboard paint while JWT hydrates from SecureStore. */
export const STARTUP_SESSION_GRACE_MS = 1500;
