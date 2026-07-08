/**
 * Work Zone picker screen cache — survives re-renders; fetch once per session.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type WorkZoneArea = {
  id: string;
  name: string;
  trips_per_week?: number;
  demand_label?: string;
  adjacent_ids?: string[];
};

export type WorkZoneDriverState = {
  active: boolean;
  area_ids: string[];
  label: string;
  expires_at?: string;
  entitled: boolean;
  feature_available: boolean;
  feature_reason?: string;
  entitlement_message?: string;
  subscription_status?: string;
  trial_active?: boolean;
  zone_running_grace?: boolean;
  included_with_driver_plan?: boolean;
  no_additional_fee?: boolean;
};

type WorkZoneScreenStore = {
  areas: WorkZoneArea[];
  driverState: WorkZoneDriverState | null;
  selected: string[];
  initialLoadDone: boolean;
  fetchInFlight: boolean;
  saving: boolean;
  lastError: string | null;

  setSaving: (saving: boolean) => void;
  setSelected: (ids: string[]) => void;
  toggleSelected: (areaId: string) => void;
  hydrate: (areas: WorkZoneArea[], driverState: WorkZoneDriverState | null) => void;
  patchDriverState: (patch: Partial<WorkZoneDriverState>) => void;
  setFetchInFlight: (v: boolean) => void;
  setLastError: (msg: string | null) => void;
  markInitialLoadDone: () => void;
};

export const useWorkZoneScreenStore = create<WorkZoneScreenStore>()(
  persist(
    (set, get) => ({
      areas: [],
      driverState: null,
      selected: [],
      initialLoadDone: false,
      fetchInFlight: false,
      saving: false,
      lastError: null,

      setSaving: (saving) => set({ saving }),

      setSelected: (ids) => set({ selected: ids }),

      toggleSelected: (areaId) => {
        const { selected, areas } = get();
        if (selected.includes(areaId)) {
          set({ selected: selected.filter((x) => x !== areaId) });
          return;
        }
        if (selected.length >= 4) return;
        if (selected.length === 0) {
          set({ selected: [areaId] });
          return;
        }
        const adjacent = selected.some((id) => {
          const a = areas.find((x) => x.id === id);
          return a?.adjacent_ids?.includes(areaId);
        });
        if (adjacent) set({ selected: [...selected, areaId] });
      },

      hydrate: (areas, driverState) => {
        const selected =
          driverState?.area_ids?.length ? [...driverState.area_ids] : get().selected;
        set({ areas, driverState, selected });
      },

      patchDriverState: (patch) => {
        const prev = get().driverState;
        if (!prev) return;
        set({ driverState: { ...prev, ...patch } });
      },

      setFetchInFlight: (v) => set({ fetchInFlight: v }),
      setLastError: (msg) => set({ lastError: msg }),
      markInitialLoadDone: () => set({ initialLoadDone: true }),
    }),
    {
      name: 'nexryde-work-zone-screen',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        areas: state.areas,
        driverState: state.driverState,
        selected: state.selected,
        initialLoadDone: state.initialLoadDone,
      }),
    },
  ),
);

/** Session-scoped guard — only one initial fetch per app session. */
let _screenFetchStartedForDriver: string | null = null;
let _screenFetchPromise: Promise<void> | null = null;

export function resetWorkZoneScreenFetchGuard() {
  _screenFetchStartedForDriver = null;
  _screenFetchPromise = null;
}

export function workZoneScreenFetchAlreadyStarted(driverId: string): boolean {
  return _screenFetchStartedForDriver === driverId && _screenFetchPromise != null;
}

export function markWorkZoneScreenFetchStarted(driverId: string, promise: Promise<void>) {
  _screenFetchStartedForDriver = driverId;
  _screenFetchPromise = promise;
}

export function getWorkZoneScreenFetchPromise(): Promise<void> | null {
  return _screenFetchPromise;
}
