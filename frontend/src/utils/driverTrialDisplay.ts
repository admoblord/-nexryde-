/** Trial banner copy aligned with server trial policy. */
export function buildTrialBannerText(params: {
  completed: number;
  target: number;
  daysRemaining?: number | null;
  dayLimit?: number | null;
  serverMessage?: string | null;
}): string {
  if (params.serverMessage?.trim()) {
    return params.serverMessage.trim();
  }
  const tripsPart = `${params.completed}/${params.target} trips`;
  if (params.dayLimit == null || params.daysRemaining == null) {
    const remaining = Math.max(0, params.target - params.completed);
    return `Free trial: ${tripsPart} · ${remaining} left`;
  }
  const d = Math.max(0, params.daysRemaining);
  return `Free trial: ${tripsPart} · ${d} day${d === 1 ? '' : 's'} left`;
}

export type TrialBannerParts = {
  prefix: string;
  tripsPart: string;
  separator: string;
  secondaryPart: string;
  emphasis: 'trips' | 'days';
};

export function splitTrialBannerForEmphasis(params: {
  completed: number;
  target: number;
  daysRemaining?: number | null;
  dayLimit?: number | null;
  emphasis?: 'trips' | 'days' | null;
}): TrialBannerParts {
  const tripsPart = `${params.completed}/${params.target} trips`;
  const tripsRemaining = Math.max(0, params.target - params.completed);
  const hasDays = params.dayLimit != null && params.daysRemaining != null;
  const daysRemaining = hasDays ? Math.max(0, params.daysRemaining!) : null;
  const secondaryPart = hasDays
    ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`
    : `${tripsRemaining} left`;
  const emphasis = params.emphasis === 'days' || params.emphasis === 'trips'
    ? params.emphasis
    : hasDays
      ? 'days'
      : 'trips';

  return {
    prefix: 'Free trial: ',
    tripsPart,
    separator: ' · ',
    secondaryPart,
    emphasis,
  };
}
