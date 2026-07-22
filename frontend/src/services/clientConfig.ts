/**
 * Server-controlled client config (feature flags), fetched at app boot.
 *
 * LAUNCH POLICY: the fare wallet is DISABLED (walletEnabled=false is the safe
 * default everywhere). Riders pay drivers directly — cash or bank transfer to
 * the driver's account. NexRyde never holds fares; the only in-app payment is
 * the driver subscription, which is NOT gated here.
 *
 * Flipping "wallet" back on in /api/admin/feature-flags re-enables all wallet
 * UI on the next app start — no rebuild needed.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '@/src/services/api';

const STORAGE_KEY = '@nexryde_client_config_v1';
const FETCH_TIMEOUT_MS = 8000;

export type ClientConfig = {
  walletEnabled: boolean;
};

// Safe launch default: wallet OFF until the server says otherwise.
let current: ClientConfig = { walletEnabled: false };
const listeners = new Set<() => void>();

function setConfig(next: ClientConfig) {
  if (next.walletEnabled === current.walletEnabled) return;
  current = next;
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* listener errors must never break config propagation */
    }
  });
}

export function isWalletEnabled(): boolean {
  return current.walletEnabled;
}

/** Load cached config instantly, then refresh from the server in background. */
export async function loadClientConfig(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ClientConfig> | null;
      if (parsed && typeof parsed.walletEnabled === 'boolean') {
        setConfig({ walletEnabled: parsed.walletEnabled });
      }
    }
  } catch {
    /* keep default (wallet off) */
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${BACKEND_URL}/api/config/client`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { wallet_enabled?: unknown };
      const cfg: ClientConfig = { walletEnabled: data?.wallet_enabled === true };
      setConfig(cfg);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    }
  } catch {
    /* offline / timeout — cached or default value stands (fails closed) */
  }
}

/** Reactive hook — re-renders when the config refresh lands. */
export function useWalletEnabled(): boolean {
  const [enabled, setEnabled] = useState(current.walletEnabled);
  useEffect(() => {
    const listener = () => setEnabled(current.walletEnabled);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return enabled;
}
