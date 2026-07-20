/**
 * Structured driver go-online / dashboard flow logging.
 * Tags requested for race-condition audits (timestamped via driverStartupTrace).
 */
import { startupLog } from '@/src/utils/driverStartupTrace';

export type DriverFlowTag =
  | 'GO_ONLINE_START'
  | 'GO_ONLINE_CONFIRMED'
  | 'GO_ONLINE_FAILED'
  | 'GO_ONLINE_RESULT'
  | 'GO_ONLINE_DESYNC'
  | 'GO_ONLINE_BLOCKED_PERMISSIONS'
  | 'GO_OFFLINE'
  | 'GO_OFFLINE_TAP'
  | 'GO_OFFLINE_UI_APPLIED'
  | 'GO_OFFLINE_API_OK'
  | 'GO_OFFLINE_API_FAILED'
  | 'GO_OFFLINE_API_FAILED_STAY_OFFLINE'
  | 'GO_OFFLINE_SESSION_FAIL_STAY_OFFLINE'
  | 'GO_OFFLINE_EXCEPTION_STAY_OFFLINE'
  | 'GO_OFFLINE_WATCHDOG_STAY_OFFLINE'
  | 'GO_OFFLINE_RESTORED_ONLINE'
  | 'GO_OFFLINE_BLOCKED_ACTIVE_TRIP'
  | 'HEARTBEAT_FORCE_OFFLINE'
  | 'SOCKET_CONNECT_START'
  | 'SOCKET_CONNECTED'
  | 'SOCKET_RECONNECT'
  | 'SOCKET_DISCONNECTED'
  | 'RECONNECTING'
  | 'LOCATION_FIX'
  | 'STARTUP_TIMEOUT'
  | 'WORK_ZONE_LOAD'
  | 'WORK_ZONE_READY'
  | 'MAP_READY'
  | 'DASHBOARD_VISIBLE'
  | 'ONLINE_READY';

export function driverFlowLog(tag: DriverFlowTag, extra?: Record<string, unknown>): void {
  startupLog(tag, extra);
}
