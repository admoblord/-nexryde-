/**
 * Human-readable message from axios/FastAPI error responses.
 */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error || typeof error !== 'object') return fallback;
  const ax = error as {
    message?: string;
    code?: string;
    response?: { data?: { detail?: unknown; message?: unknown } };
  };
  if (ax.code === 'ECONNABORTED' || ax.message?.toLowerCase().includes('timeout')) {
    return 'Request timed out. Check your connection and try again.';
  }
  if (ax.message === 'Network Error') {
    return 'Could not reach NexRyde. Your device may still be online.';
  }
  const data = ax.response?.data;
  if (data && typeof data === 'object') {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; message?: string } | string;
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object') {
        const m = first.msg || first.message;
        if (typeof m === 'string' && m.trim()) return m.trim();
      }
    }
    const msg = (data as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  if (typeof ax.message === 'string' && ax.message.trim() && ax.message !== 'Error') return ax.message.trim();
  return fallback;
}
