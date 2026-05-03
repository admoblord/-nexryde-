import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { DriverStatusWidget } from './DriverStatusWidget';

const STATE_KEY = '@nexryde_driver_state_v2';

async function getIsOnline(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    return Boolean(state?.isOnline);
  } catch {
    return false;
  }
}

/**
 * Handles all Android widget lifecycle events in the headless JS context.
 * Registered once in index.ts via registerWidgetTaskHandler().
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetAction } = props.widgetInfo as { widgetAction?: string };

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const isOnline = await getIsOnline();
      await props.renderWidget(
        React.createElement(DriverStatusWidget, { isOnline }),
      );
      break;
    }

    case 'WIDGET_CLICK': {
      // Refresh widget state after the click (user navigated to app)
      const isOnline = await getIsOnline();
      await props.renderWidget(
        React.createElement(DriverStatusWidget, { isOnline }),
      );
      break;
    }

    case 'WIDGET_DELETED':
      break;

    default:
      break;
  }
}
