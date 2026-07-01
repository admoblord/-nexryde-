/**
 * V2 bottom status bar — live pulse dot, phase status text,
 * connection state on the right ("Live GPS" / "Reconnecting…").
 */
import React, { memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TV2 } from '@/src/components/tracking/v2/trackingV2Theme';
import { TV2_LAYOUT } from '@/src/components/tracking/v2/trackingV2Layout';

type Props = {
  statusText: string;
  live: boolean;
  bottomInset: number;
};

function TrackingBottomBarV2Inner({ statusText, live, bottomInset }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, 10) }]}>
      <View style={styles.inner}>
        <View style={styles.left}>
          <View style={styles.dotWrap}>
            <Animated.View
              style={[
                styles.dotGlow,
                {
                  backgroundColor: live ? TV2.green : TV2.gold,
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
                },
              ]}
            />
            <View style={[styles.dot, { backgroundColor: live ? TV2.green : TV2.gold }]} />
          </View>
          <Text style={styles.statusTxt} numberOfLines={1} accessibilityLiveRegion="polite">
            {statusText}
          </Text>
        </View>
        <View style={styles.right}>
          <Ionicons
            name={live ? 'radio-outline' : 'cloud-offline-outline'}
            size={13}
            color={live ? TV2.green : TV2.gold}
          />
          <Text style={[styles.connTxt, { color: live ? TV2.green : TV2.gold }]}>
            {live ? 'Live GPS' : 'Reconnecting…'}
          </Text>
        </View>
      </View>
    </View>
  );
}

export const TrackingBottomBarV2 = memo(TrackingBottomBarV2Inner);

const styles = StyleSheet.create({
  bar: {
    backgroundColor: TV2.glass,
    borderTopWidth: 1,
    borderTopColor: TV2.hairline,
    paddingTop: 10,
    paddingHorizontal: TV2.edge + 4,
    minHeight: TV2_LAYOUT.bottomBar,
  },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 },
  dotWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  dotGlow: { position: 'absolute', width: 16, height: 16, borderRadius: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusTxt: { fontSize: 13, fontWeight: '800', color: TV2.text, flexShrink: 1, height: 18 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  connTxt: { fontSize: 11.5, fontWeight: '800' },
});
