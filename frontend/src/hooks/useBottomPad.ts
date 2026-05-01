/**
 * useBottomPad — safe-area-aware bottom padding utility.
 *
 * TAB_BAR_HEIGHT is the visible content height of the tab bar (excluding the
 * system home-indicator area which is handled by SafeAreaProvider).
 *
 * Usage in tab screens (where the tab bar sits below):
 *   const tabPad = useTabBottomPad();
 *   <ScrollView contentContainerStyle={{ paddingBottom: tabPad }} />
 *
 * Usage in full-screen / stack screens (no tab bar):
 *   const { bottom } = useBottomInset();
 *   <View style={{ paddingBottom: bottom + 8 }} />
 */

import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Visible tab-bar icon+label height (not counting the home indicator) */
export const TAB_BAR_HEIGHT = 56;

/** Total bottom clearance needed inside a tab screen scroll view */
export function useTabBottomPad(extra = 0): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + insets.bottom + extra;
}

/** Raw system bottom inset (for stack / modal screens) */
export function useBottomInset(): { bottom: number } {
  const insets = useSafeAreaInsets();
  return { bottom: insets.bottom };
}
