import React, { Component, type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  children: ReactNode;
  onRetry?: () => void;
};

type State = { hasError: boolean };

/** Prevents a native map failure from killing the whole tracking screen. */
export class TripMapErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (__DEV__) {
      console.warn('[TripMapErrorBoundary]', error.message);
    }
    // Report to Sentry with map context
    try {
      const { sentryError } = require('@/src/utils/sentryBreadcrumbs');
      sentryError(error, { context: 'TripMapErrorBoundary' });
    } catch { /* Sentry not available */ }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.fallback}>
        <Ionicons name="map-outline" size={36} color="#64748B" />
        <Text style={styles.title}>Map unavailable</Text>
        <Text style={styles.sub}>
          Live trip updates continue below. You can still call or message your driver.
        </Text>
        {this.props.onRetry ? (
          <TouchableOpacity style={styles.btn} onPress={this.props.onRetry} activeOpacity={0.88}>
            <Text style={styles.btnTxt}>Retry map</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0F172A',
    gap: 8,
  },
  title: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  sub: { color: '#94A3B8', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  btn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.45)',
  },
  btnTxt: { color: '#6EE7B7', fontWeight: '800', fontSize: 13 },
});
