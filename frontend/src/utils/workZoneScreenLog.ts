/** Structured Work Zone screen lifecycle logs (field debugging). */
export type WorkZoneScreenLogTag =
  | 'WORKZONE_SCREEN_MOUNT'
  | 'WORKZONE_UNMOUNT'
  | 'WORKZONE_FETCH_START'
  | 'WORKZONE_FETCH_SUCCESS'
  | 'WORKZONE_FETCH_ERROR'
  | 'WORKZONE_RENDER';

export function workZoneScreenLog(tag: WorkZoneScreenLogTag, extra?: Record<string, unknown>) {
  if (__DEV__) {
    console.log(`[${tag}]`, extra ?? {});
  }
}
