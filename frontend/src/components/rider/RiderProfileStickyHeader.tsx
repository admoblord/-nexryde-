import React from 'react';
import { NexrydeBrandRow } from '@/src/components/brand/NexrydeBrandRow';
import { PROFILE } from '@/src/constants/riderProfileBrand';

export function RiderProfileStickyHeader() {
  return (
    <NexrydeBrandRow
      theme="dark"
      padH={16}
      style={{ backgroundColor: `${PROFILE.bg}E6`, paddingVertical: 4 }}
      showBorder
    />
  );
}
