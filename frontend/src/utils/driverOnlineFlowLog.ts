/**
 * Structured driver go-online / dashboard flow logging.
 * Tags requested for race-condition audits (timestamped via driverStartupTrace).
 */
import { startupLog } from '@/src/utils/driverStartupTrace';

export type DriverFlowTag =
  | 'GO_ONLINE_START'
  | 'GO_ONLINE_CONFIRMED'
  | 'GO_ONLINE_FAILED'
  | 'GO_OFFLINE'
  | 'SOCKET_CONNECT_START'
  | 'SOCKET_CONNECTED'
  | 'SOCKET_RECONNECT'
  | 'SOCKET_DISCONNECTED'
  | 'RECONNECTING'
  | 'WORK_ZONE_LOAD'
  | 'WORK_ZONE_READY'
  | 'MAP_READY'
  | 'DASHBOARD_VISIBLE'
  | 'ONLINE_READY';

export function driverFlowLog(tag: DriverFlowTag, extra?: Record<string, unknown>): void {
  startupLog(tag, extra);
}
