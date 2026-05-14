import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !state.isConnected;
      setIsOffline(offline);
      Animated.spring(slideAnim, {
        toValue: offline ? 0 : -60,
        useNativeDriver: true,
        friction: 8,
      }).start();
    });
    return () => unsubscribe();
  }, []);

  if (!isOffline) return null;

  const padTop = Math.max(insets.top, 10);

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingTop: padTop + 6, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Ionicons name="cloud-offline" size={16} color="#FFF" />
      <Text style={styles.text}>No internet connection</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 10,
    gap: 8,
    zIndex: 9999,
  },
  text: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
