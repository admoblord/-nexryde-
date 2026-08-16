/**
 * Pull display fields from GET /drivers/:id/profile so the driver Profile
 * tab can paint name, city, vehicles, and verification from prefetch.
 */
export type DriverVehicleRow = {
  id?: string;
  make?: string;
  model?: string;
  year?: string;
  color?: string;
  plate?: string;
  type?: string;
  is_active?: boolean;
  is_default?: boolean;
};

export type DriverProfileDisplay = {
  city: string;
  fullName: string;
  vehicles: DriverVehicleRow[];
  verificationStatus: string;
};

export function driverProfileDisplay(
  incoming: Record<string, unknown> | null | undefined,
): DriverProfileDisplay {
  const vehiclesRaw = incoming?.vehicles;
  const vehicles = Array.isArray(vehiclesRaw)
    ? (vehiclesRaw.filter((v) => v && typeof v === 'object') as DriverVehicleRow[])
    : [];
  return {
    city: typeof incoming?.city === 'string' ? incoming.city : '',
    fullName:
      (typeof incoming?.full_name === 'string' && incoming.full_name.trim()) ||
      (typeof incoming?.name === 'string' && incoming.name.trim()) ||
      '',
    vehicles,
    verificationStatus:
      typeof incoming?.verification_status === 'string' ? incoming.verification_status : '',
  };
}
