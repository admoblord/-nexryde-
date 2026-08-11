import { apiFetch } from '@/src/utils/sessionRefresh';

export type EarningsPeriod = 'today' | 'week' | 'month';

export type DriverEarningsScreenData = {
  dashboard: Record<string, unknown>;
  bankReady: boolean;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function fetchDriverEarningsScreenData(
  driverId: string,
  period: EarningsPeriod,
): Promise<DriverEarningsScreenData> {
  const [dashRes, bankRes] = await Promise.all([
    apiFetch(`/driver/earnings/${driverId}?period=${period}`),
    apiFetch(`/drivers/${driverId}/bank-details`),
  ]);

  const bankJson = await readJson(bankRes);
  const bankReady = Boolean(bankJson.payout_ready);

  if (!dashRes.ok) {
    if (dashRes.status >= 500) {
      throw new Error(`earnings_failed_${dashRes.status}`);
    }
    return {
      dashboard: {
        summary: {
          total_earnings: 0,
          total_trips: 0,
          total_distance_km: 0,
          total_time_mins: 0,
        },
        averages: { per_trip: 0, per_km: 0, hourly: 0 },
        projections: { daily: 0, weekly: 0, monthly: 0 },
        daily_breakdown: {},
      },
      bankReady,
    };
  }

  const dashboard = await readJson(dashRes);

  return {
    dashboard,
    bankReady,
  };
}
