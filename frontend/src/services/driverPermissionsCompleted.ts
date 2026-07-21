/**
 * Law 5 — permission preflight runs before FIRST go-online only.
 * Once every required permission is granted we persist completed=true and stop
 * showing the checklist. Only a real revocation detected at GO-tap (or FGS start)
 * clears the flag and brings the checklist back.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@nexryde_driver_permissions_completed_v1';

let memory: boolean | null = null;

export function peekPermissionsCompleted(): boolean {
  return memory === true;
}

export async function readPermissionsCompleted(): Promise<boolean> {
  if (memory != null) return memory;
  try {
    memory = (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    memory = false;
  }
  return memory;
}

export async function writePermissionsCompleted(completed: boolean): Promise<void> {
  memory = completed;
  try {
    if (completed) await AsyncStorage.setItem(KEY, '1');
    else await AsyncStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}
