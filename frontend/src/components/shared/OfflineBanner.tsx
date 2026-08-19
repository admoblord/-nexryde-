/**
 * Connection chrome (2px strip + status pill under the Android status bar)
 * is permanently removed. Do not reintroduce a top line, banner, or dot.
 *
 * Network / reconnect / WebSocket / dispatch logic is unchanged and lives in
 * `platformConnectionManager` (NetworkStateManager). This module stays so
 * historical imports do not crash; it renders nothing.
 */
import React from 'react';

export const OfflineBanner: React.FC = () => null;
