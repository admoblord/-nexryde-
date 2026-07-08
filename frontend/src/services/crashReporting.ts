class CrashReporter {
  private static errors: Array<{ timestamp: string; error: string; stack?: string }> = [];
  private static endpoint = process.env.EXPO_PUBLIC_CRASH_REPORT_URL || '';
  private static apiKey = process.env.EXPO_PUBLIC_CRASH_REPORT_KEY || '';

  private static async sendToSink(payload: Record<string, unknown>) {
    if (!this.endpoint) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'x-crash-key': this.apiKey } : {}),
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Keep local fallback only; telemetry must never crash the app.
    }
  }

  static captureException(error: Error, context?: Record<string, string>) {
    const entry = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      ...context,
    };
    this.errors.push(entry);
    console.error('[CrashReporter]', entry.error);
    void this.sendToSink({ level: 'error', ...entry });

    if (this.errors.length > 50) {
      this.errors = this.errors.slice(-50);
    }
  }

  static captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    console.log(`[CrashReporter:${level}]`, message);
    void this.sendToSink({
      timestamp: new Date().toISOString(),
      level,
      message,
    });
  }

  static getRecentErrors() {
    return this.errors;
  }
}

export default CrashReporter;
