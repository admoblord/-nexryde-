/** Debug-mode NDJSON ingest (session 274678). No secrets/PII. */
export function debugSessionLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = 'run1',
): void {
  if (process.env.NODE_ENV === 'production') return;

  // #region agent log
  fetch('http://127.0.0.1:7639/ingest/774e86fb-629a-4687-bad0-4630ed7bb9d7', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '274678',
    },
    body: JSON.stringify({
      sessionId: '274678',
      location,
      message,
      data,
      hypothesisId,
      runId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}
