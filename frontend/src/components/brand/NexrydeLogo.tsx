import React from 'react';
import type { StyleProp, ImageStyle } from 'react-native';
import { NEXRYDE_BRAND } from '@/src/constants/nexrydeBrand';
import { NexrydeMark } from '@/src/components/brand/NexrydeMark';

type Props = {
  size?: number;
  /** False renders the transparent N with no navy field behind it. */
  framed?: boolean;
  style?: StyleProp<ImageStyle>;
};

/**
 * Standard NEXRYDE mark for every surface.
 *
 * This used to draw a green circle with a generic car glyph from the icon font,
 * which is not the logo — so headers, the loading screen and the brand row all
 * showed something the launcher icon does not. It now renders the shipped icon
 * through `NexrydeMark`, keeping the same `size` API so existing callers are
 * unchanged.
 */
export function NexrydeLogo({ size = NEXRYDE_BRAND.logo.size, framed = true, style }: Props) {
  return <NexrydeMark size={size} framed={framed} style={style} />;
}

export default NexrydeLogo;
