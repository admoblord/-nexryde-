import React from 'react';
import { View, Text, Pressable } from 'react-native';

export function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
      <Text style={{ color: '#C9CDD2', textAlign: 'center' }}>{message}</Text>
      <Pressable
        onPress={onRetry}
        style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#1F2937' }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
      </Pressable>
    </View>
  );
}
