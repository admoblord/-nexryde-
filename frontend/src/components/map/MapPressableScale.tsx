import React, { useRef } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type Props = PressableProps & {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  scaleTo?: number;
};

/** 100ms tap scale — spec micro-interaction. */
export function MapPressableScale({ style, children, scaleTo = 0.95, onPress, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (v: number) => {
    Animated.spring(scale, {
      toValue: v,
      friction: 8,
      tension: 320,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        animate(scaleTo);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animate(1);
        rest.onPressOut?.(e);
      }}
      onPress={onPress}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
