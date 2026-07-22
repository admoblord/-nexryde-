import React from 'react';
import FeatureNotificationsScreen from '@/src/components/FeatureNotificationsScreen';

// Per-tab crash safety net — confines any render error to this tab (never to OS home).
export { ErrorBoundary } from '@/src/components/driver/DriverTabErrorBoundary';

export default function DriverNotificationsTab() {
  return <FeatureNotificationsScreen role="driver" />;
}

