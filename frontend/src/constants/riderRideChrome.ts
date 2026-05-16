/**
 * Rider booking + live-trip surfaces — CTA gradients and accents aligned with driver dock neon.
 * Rider home stays on light gray; use `RIDER_HOME_*` for elevated bars there.
 */

/** Default green CTA (book sheet, rider home small buttons) */
export const RIDER_PRIMARY_CTA_GRADIENT = ['#34F5B8', '#00B85C'] as const;

/** Map-first tracking dock — slightly brighter mint → deep green */
export const RIDER_MAP_PRIMARY_CTA_GRADIENT = ['#3CFFB3', '#00D46A', '#057A48'] as const;

export const RIDER_HOME_DEST_BAR_BORDER = 'rgba(57,255,20,0.32)';
export const RIDER_HOME_WALLET_BORDER = 'rgba(57,255,20,0.14)';

/** Finding-driver phase — sheet border + handle (book overlay + tracking) */
export const RIDER_FINDING_HANDLE_GRADIENT = [
  'rgba(60,255,179,0.55)',
  'rgba(59,130,246,0.28)',
  'rgba(60,255,179,0.5)',
] as const;

export const RIDER_FINDING_SHEET_BORDER = 'rgba(52,245,184,0.2)';
export const RIDER_FINDING_GLOW = '#34F5B8';
