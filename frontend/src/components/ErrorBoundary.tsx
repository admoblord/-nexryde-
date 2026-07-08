import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '@/src/constants/theme';
import CrashReporter from '@/src/services/crashReporting';
import { sentryError } from '@/src/utils/sentryBreadcrumbs';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
}

/**
 * ErrorBoundary Component
 * Catches JavaScript errors anywhere in the child component tree
 * Prevents app from crashing completely
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    // Log error details for debugging
    console.error('🚨 ErrorBoundary caught an error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Component stack:', errorInfo.componentStack);

    CrashReporter.captureException(error, { component: errorInfo?.componentStack?.slice(0, 200) || 'unknown' });
    sentryError(error, {
      boundary: 'ErrorBoundary',
      componentStack: errorInfo?.componentStack?.slice(0, 500),
    });

    // Log to help identify the issue
    if (error.message) {
      console.error('📋 Specific error:', error.message);
    }

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error screen
      return (
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
          <View style={styles.container}>
            <View style={styles.content}>
              <View style={styles.iconContainer}>
                <Ionicons name="alert-circle" size={80} color={COLORS.errorBright} />
              </View>

              <Text style={styles.title}>Something went wrong</Text>
              <Text style={styles.message}>
                The app hit an unexpected error. Your account data on the server is unchanged — try again, or restart the app if this keeps happening.
              </Text>

              <TouchableOpacity
                style={styles.resetButton}
                onPress={this.handleReset}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Try again after an error"
              >
                <Ionicons name="refresh" size={20} color={COLORS.primaryDark} />
                <Text style={styles.resetButtonText}>Try again</Text>
              </TouchableOpacity>

              {__DEV__ && this.state.error && (
                <ScrollView style={styles.errorDetails}>
                  <Text style={styles.errorTitle}>Error details (development only)</Text>
                  <Text style={styles.errorText}>{this.state.error.toString()}</Text>
                  {this.state.errorInfo && (
                    <Text style={styles.errorText}>
                      {this.state.errorInfo.componentStack}
                    </Text>
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accentGreen,
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    gap: 8,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  errorDetails: {
    marginTop: 24,
    padding: 16,
    backgroundColor: COLORS.errorSoft,
    borderRadius: 12,
    maxHeight: 200,
    width: '100%',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.errorBright,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.errorBright,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
