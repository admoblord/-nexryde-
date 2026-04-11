class CrashReporter {
  private static errors: Array<{ timestamp: string; error: string; stack?: string }> = [];

  static captureException(error: Error, context?: Record<string, string>) {
    const entry = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      ...context,
    };
    this.errors.push(entry);
    console.error('[CrashReporter]', entry.error);

    // Keep only last 50 errors in memory
    if (this.errors.length > 50) {
      this.errors = this.errors.slice(-50);
    }
  }

  static captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    console.log(`[CrashReporter:${level}]`, message);
  }

  static getRecentErrors() {
    return this.errors;
  }
}

export default CrashReporter;
