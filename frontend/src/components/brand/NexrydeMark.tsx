/**
 * The NEXRYDE icon, used in-app.
 *
 * Header badges used to be the letters "NX" on a green square, which is not the
 * logo. This renders the same asset the launcher and splash use, so the mark is
 * identical everywhere it appears.
 *
 *   framed  the icon with its navy field, for light surfaces
 *   plain   the transparent N, for dark surfaces and over the map
 */
import React from 'react';
import { Image, StyleSheet, type StyleProp, type ImageStyle } from 'react-native';

const FRAMED_ICON = require('../../../assets/images/icon.png');
const PLAIN_MARK = require('../../../assets/images/adaptive-icon.png');

type Props = {
  size?: number;
  /** False renders the transparent N with no navy field behind it. */
  framed?: boolean;
  style?: StyleProp<ImageStyle>;
};

export function NexrydeMark({ size = 34, framed = true, style }: Props) {
  return (
    <Image
      source={framed ? FRAMED_ICON : PLAIN_MARK}
      style={[
        { width: size, height: size },
        framed ? { borderRadius: Math.round(size * 0.28) } : null,
        style,
      ]}
      resizeMode="contain"
      accessibilityLabel="NEXRYDE"
      accessible={false}
    />
  );
}

export default NexrydeMark;

/** Kept so callers can size a row around the mark without magic numbers. */
export const NEXRYDE_MARK_SIZE = 34;

export const nexrydeMarkStyles = StyleSheet.create({
  inline: { marginRight: 10 },
});
