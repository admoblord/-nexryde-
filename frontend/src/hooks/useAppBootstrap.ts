import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Router } from 'expo-router';
import { getUserSession } from '@/utils/authStorage';
import { useAppStore } from '@/src/store/appStore';
import { loadDriverState } from '@/src/services/driverStateService';
import { awaitPersistHydration } from '@/src/hooks/usePersistStoreReady';
import { setTokens, warmTokenCache } from '@/src/lib/tokenStore';
import {
  routeAuthedUser,
  syncAuthStatusInBackground,
  type AuthedUserForRouting,
} from '@/src/utils/sessionRouting';
import type { NexLoadingStepId } from '@/src/constants/nexrydeLoadingBrand';

const DRIVER_CAMERA_RESUME_KEY = '@driver_documents_camera_resume';

export type BootstrapPhase = 'loading' | 'welcome';

type SessionPayload = {
  id: string;
  phone?: string;
  name?: string | null;
  email?: string | null;
  role: 'rider' | 'driver' | 'admin';
  token: string | null;
  refresh_token?: string | null;
  is_verified?: boolean;
  face_verified?: boolean;
};

export function useAppBootstrap(router: Pick<Router, 'replace' | 'push'>) {
  const [phase, setPhase] = useState<BootstrapPhase>(Platform.OS === 'web' ? 'welcome' : 'loading');
  const [progress, setProgress] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<NexLoadingStepId[]>([]);
  const [currentStep, setCurrentStep] = useState<NexLoadingStepId | null>('session');
  const started = useRef(false);
  const routed = useRef(false);

  const setUser = useAppStore((s) => s.setUser);
  const setIsAuthenticated = useAppStore((s) => s.setIsAuthenticated);

  const applySessionToStore = useCallback(
    async (userData: SessionPayload) => {
      if (userData.token) {
        await setTokens(userData.token, userData.refresh_token ?? undefined);
      } else {
        void warmTokenCache();
      }
      setUser(userData as unknown as Parameters<typeof setUser>[0]);
      setIsAuthenticated(true);
    },
    [setIsAuthenticated, setUser],
  );

  const routeRestoredSession = useCallback(
    async (userData: SessionPayload) => {
      if (routed.current) return;
      routed.current = true;
      await applySessionToStore(userData);
      if (userData.role === 'rider' || userData.role === 'driver') {
        import('@/src/services/nexrydeScheduledNotifications')
          .then(({ scheduleOfferNotificationsForRole }) =>
            scheduleOfferNotificationsForRole(userData.role as 'rider' | 'driver'),
          )
          .catch(() => {});
      }
      syncAuthStatusInBackground(userData, userData.token);
      if (userData.role === 'driver') {
        void loadDriverState(userData.id).catch(() => null);
      }
      try {
        await routeAuthedUser(router, userData as unknown as AuthedUserForRouting, userData.token);
      } catch (e) {
        console.error('Bootstrap routing failed:', e);
        routed.current = false;
        setPhase('welcome');
      }
    },
    [applySessionToStore, router],
  );

  const resolveSession = useCallback(async (): Promise<SessionPayload | null> => {
    const [, secure] = await Promise.all([awaitPersistHydration(), getUserSession()]);
    const store = useAppStore.getState();
    if (store.isAuthenticated && store.user?.id) {
      return {
        id: store.user.id,
        phone: store.user.phone,
        name: store.user.name,
        email: store.user.email,
        role: store.user.role,
        token: secure?.token ?? null,
        refresh_token: (secure as { refresh_token?: string })?.refresh_token ?? null,
        is_verified: store.user.is_verified,
        face_verified: (store.user as { face_verified?: boolean }).face_verified,
      };
    }
    if (!secure?.id) return null;
    return {
      id: secure.id,
      phone: secure.phone,
      name: secure.name ?? null,
      email: secure.email ?? null,
      role: (secure.role as 'rider' | 'driver' | 'admin') || 'rider',
      token: secure.token || null,
      refresh_token: (secure as { refresh_token?: string }).refresh_token || null,
      is_verified: secure.is_verified,
      face_verified: secure.face_verified,
    };
  }, []);

  const finishWelcome = useCallback(async () => {
    const onboardingDone = await AsyncStorage.getItem('onboarding_complete');
    if (!onboardingDone) {
      router.replace('/onboarding');
      return;
    }
    setPhase('welcome');
  }, [router]);

  const runBootstrap = useCallback(async () => {
    const step = (id: NexLoadingStepId, pct: number) => {
      setCurrentStep(id);
      setProgress(pct);
    };

    try {
      step('session', 40);
      const session = await resolveSession();

      if (session) {
        setCompletedSteps(['session', 'loading']);
        setProgress(100);
        setCurrentStep(null);
        await routeRestoredSession(session);
        return;
      }

      setCompletedSteps(['session', 'loading', 'preparing']);
      setProgress(100);
      setCurrentStep(null);

      const onboardingDone = await AsyncStorage.getItem('onboarding_complete');
      if (!onboardingDone) {
        router.replace('/onboarding');
        return;
      }
      setPhase('welcome');
    } catch {
      const session = await resolveSession().catch(() => null);
      if (session) {
        await routeRestoredSession(session);
        return;
      }
      setProgress(100);
      setCurrentStep(null);
      await finishWelcome();
    }
  }, [finishWelcome, routeRestoredSession, resolveSession, router]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (started.current) return;
    started.current = true;

    void runBootstrap();
  }, [runBootstrap]);

  return { phase, progress, completedSteps, currentStep };
}
