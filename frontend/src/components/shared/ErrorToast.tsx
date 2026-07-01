/**
 * Global error toast system. Drop <ErrorToastProvider/> in _layout.tsx
 * and call useErrorToast().show() anywhere in the app.
 *
 * Replaces raw Alert.alert() calls for non-blocking error feedback.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ToastTone = 'error' | 'success' | 'warning' | 'info';

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
  duration?: number;
}

interface ErrorToastContextType {
  show: (message: string, tone?: ToastTone, duration?: number) => void;
}

const ErrorToastContext = createContext<ErrorToastContextType>({
  show: () => {},
});

export const useErrorToast = () => useContext(ErrorToastContext);

const TONE_COLORS: Record<ToastTone, string> = {
  error: '#7F1D1D',
  success: '#14532D',
  warning: '#713F12',
  info: '#1E3A5F',
};

const TONE_BORDERS: Record<ToastTone, string> = {
  error: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  info: '#3B82F6',
};

const TONE_ICONS: Record<ToastTone, React.ComponentProps<typeof Ionicons>['name']> = {
  error: 'alert-circle-outline',
  success: 'checkmark-circle-outline',
  warning: 'warning-outline',
  info: 'information-circle-outline',
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: () => void }> = ({
  toast,
  onDismiss,
}) => {
  const slideY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 180 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.spring(slideY, { toValue: -80, useNativeDriver: true, damping: 18, stiffness: 180 }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, toast.duration ?? 3500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: TONE_COLORS[toast.tone],
          borderLeftColor: TONE_BORDERS[toast.tone],
          transform: [{ translateY: slideY }],
          opacity,
        },
      ]}
    >
      <Ionicons name={TONE_ICONS[toast.tone]} size={18} color={TONE_BORDERS[toast.tone]} />
      <Text style={styles.toastText} numberOfLines={2}>
        {toast.message}
      </Text>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={16} color="#94A3B8" />
      </TouchableOpacity>
    </Animated.View>
  );
};

let _toastId = 0;

export const ErrorToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const show = useCallback((message: string, tone: ToastTone = 'error', duration = 3500) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone, duration }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ErrorToastContext.Provider value={{ show }}>
      {children}
      <View style={styles.container} pointerEvents="box-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </View>
    </ErrorToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 56,
    left: 12,
    right: 12,
    zIndex: 99999,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderLeftWidth: 3,
  },
  toastText: {
    flex: 1,
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
});
