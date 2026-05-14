/**
 * Shared visual tokens for driver trip docks + related modals.
 * Keeps pickup / arrived / start / ongoing / offer surfaces aligned.
 */

export const DOCK_TOP_RADIUS = 32;
/** expo-blur intensity for dock shells */
export const DOCK_BLUR_INTENSITY = 56;
/** Brand header (DriverBrandChrome) — slightly softer when not in offer mode */
export const HEADER_BLUR_DEFAULT = 48;
export const HEADER_BLUR_INCOMING = 56;

/** Drag handle — mint + subtle blue (matches ongoing / “live” family) */
export const HANDLE_GRADIENT_DEFAULT: readonly [string, string, string] = [
  'rgba(52,245,184,0.52)',
  'rgba(59,130,246,0.26)',
  'rgba(52,245,184,0.48)',
];

export const HANDLE_GRADIENT_ONGOING: readonly [string, string, string] = [
  'rgba(57,255,20,0.55)',
  'rgba(59,130,246,0.32)',
  'rgba(57,255,20,0.5)',
];
