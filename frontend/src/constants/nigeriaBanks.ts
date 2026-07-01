/**
 * Nigerian banks with Squad NIP bank codes, used for driver payout bank selection.
 * Codes match Squad's Transfer API "Available Bank Codes" list.
 */
export type NigeriaBank = { name: string; code: string };

export const NIGERIA_BANKS: NigeriaBank[] = [
  { name: 'Access Bank', code: '000014' },
  { name: 'Citi Bank', code: '000009' },
  { name: 'Ecobank', code: '000010' },
  { name: 'Fidelity Bank', code: '000007' },
  { name: 'First Bank of Nigeria', code: '000016' },
  { name: 'FCMB', code: '000003' },
  { name: 'Globus Bank', code: '000027' },
  { name: 'GTBank', code: '000013' },
  { name: 'Heritage Bank', code: '000020' },
  { name: 'JAIZ Bank', code: '000006' },
  { name: 'Keystone Bank', code: '000002' },
  { name: 'Kuda Microfinance Bank', code: '090267' },
  { name: 'Lotus Bank', code: '000029' },
  { name: 'Moniepoint MFB', code: '090405' },
  { name: 'Opay (Opay Digital Services)', code: '100004' },
  { name: 'Optimus Bank', code: '000036' },
  { name: 'PalmPay', code: '100033' },
  { name: 'Parallex Bank', code: '090004' },
  { name: 'Polaris Bank', code: '000008' },
  { name: 'PremiumTrust Bank', code: '000031' },
  { name: 'Providus Bank', code: '000023' },
  { name: 'Stanbic IBTC Bank', code: '000012' },
  { name: 'Standard Chartered', code: '000021' },
  { name: 'Sterling Bank', code: '000001' },
  { name: 'SunTrust Bank', code: '000022' },
  { name: 'TAJ Bank', code: '000026' },
  { name: 'Titan Trust Bank', code: '000025' },
  { name: 'UBA (United Bank for Africa)', code: '000004' },
  { name: 'Union Bank', code: '000018' },
  { name: 'Unity Bank', code: '000011' },
  { name: 'VFD Microfinance Bank', code: '090110' },
  { name: 'Wema Bank', code: '000017' },
  { name: 'Zenith Bank', code: '000015' },
];

export function bankCodeForName(name?: string | null): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  const found = NIGERIA_BANKS.find(
    (b) => b.name.toLowerCase() === n || b.name.toLowerCase().startsWith(n) || n.startsWith(b.name.toLowerCase()),
  );
  return found?.code ?? null;
}
