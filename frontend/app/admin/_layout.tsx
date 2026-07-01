import { Stack } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { useEffect } from 'react';
import { router } from 'expo-router';

export default function AdminLayout() {
  const user = useAppStore(s => s.user);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/');
    }
  }, [user]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
