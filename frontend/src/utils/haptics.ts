/**
 * Centralized haptic feedback utility.
 *
 * Provides consistent haptic patterns across the app so the touch feel is
 * identical to Uber/Bolt:
 *
 *   light()   — button taps, selection changes
 *   medium()  — confirmations, toggle actions
 *   heavy()   — destructive actions (cancel, end trip), errors
 *   success() — trip confirmed, payment done
 *   warning() — subscription expiry alerts, low balance
 *   error()   — failed action, API error
 *   impact()  — soft impact for drag handles / drag-end
 */

import * as Haptics from 'expo-haptics';

function safe(fn: () => Promise<void>) {
  return fn().catch(() => {/* haptics not available on all devices */});
}

export const haptics = {
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  impact: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  selection: () => safe(() => Haptics.selectionAsync()),
};
