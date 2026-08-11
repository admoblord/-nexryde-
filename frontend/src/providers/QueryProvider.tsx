import React, { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { QueryClient, onlineManager, focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Sync React Query's online state with actual network
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

// Refetch when app returns to foreground
focusManager.setEventListener((handleFocus) => {
  if (Platform.OS === 'web') {
    return () => undefined;
  }
  const sub = AppState.addEventListener('change', (status) => {
    handleFocus(status === 'active');
  });
  return () => sub.remove();
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Serve cache first; background revalidate.
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24, // 24h
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnMount: 'always',
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: 'online',
    },
    mutations: {
      retry: 0,
      networkMode: 'online',
    },
  },
});

const asyncPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'nexryde:rq-cache-v1',
  throttleTime: 1000,
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(true);

  useEffect(() => {
    // Persist client is ready immediately; hydration is async inside provider.
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncPersister,
        maxAge: 1000 * 60 * 60 * 24,
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === 'success',
        },
      }}
      onSuccess={() => {
        // Resume mutations / mark hydrated — cache already painted screens.
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
