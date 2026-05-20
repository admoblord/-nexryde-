import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

interface Props {
  isOnline: boolean;
}

/**
 * Home-screen widget rendered via react-native-android-widget (Glance).
 * Only FlexWidget / TextWidget primitives are supported; no RN View/Text.
 * ClickAction URIs open the app and trigger the deep-link handler.
 */
export function DriverStatusWidget({ isOnline }: Props) {
  const statusColor = isOnline ? '#22C55E' : '#64748B';
  const statusLabel = isOnline ? 'Online' : 'Offline';
  const btnLabel = isOnline ? 'Open app' : 'Go Online';
  const btnBg = isOnline ? '#166534' : '#22C55E';
  const btnText = isOnline ? '#4ADE80' : '#052E16';
  const actionUri = isOnline ? 'nexryde://action/open_app' : 'nexryde://action/go_online';

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: '#0F172A',
        borderRadius: 16,
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 14,
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: actionUri }}
    >
      {/* ── App brand row ── */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <TextWidget
          text="NEXRYDE"
          style={{ fontSize: 11, fontWeight: '700', color: '#22C55E' }}
        />
        <FlexWidget
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: statusColor,
          }}
        />
      </FlexWidget>

      {/* ── Status label ── */}
      <FlexWidget style={{ flexDirection: 'column' }}>
        <TextWidget
          text="Driver Status"
          style={{ fontSize: 10, color: '#64748B' }}
        />
        <TextWidget
          text={statusLabel}
          style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF' }}
        />
      </FlexWidget>

      {/* ── CTA button ── */}
      <FlexWidget
        style={{
          backgroundColor: btnBg,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 8,
          paddingHorizontal: 12,
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: actionUri }}
      >
        <TextWidget
          text={btnLabel}
          style={{ fontSize: 13, fontWeight: '700', color: btnText }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
