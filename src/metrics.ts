import type { HttpAttemptLog } from "./http.js";

export type HttpSummary = {
  totalAttempts: number;
  totalRetries: number; // attempts beyond first per request are not tracked here; we count attempts with willRetry true
  errors: number; // attempts that ended with errorCode
  statuses: Record<string, number>;
  latenciesMs: { p50: number; p95: number; max: number };
};

export class HttpMetrics {
  private durations: number[] = [];
  private retries = 0;
  private errors = 0;
  private statuses: Record<string, number> = {};
  private attempts = 0;

  addAttempt(a: HttpAttemptLog) {
    this.attempts += 1;
    this.durations.push(a.durationMs);
    if (a.willRetry) this.retries += 1;
    if (a.errorCode) this.errors += 1;
    const key = String(a.statusCode ?? "ERR");
    this.statuses[key] = (this.statuses[key] || 0) + 1;
  }

  summary(): HttpSummary {
    const sorted = [...this.durations].sort((x, y) => x - y);
    const pick = (q: number) => {
      if (!sorted.length) return 0;
      const idx = Math.min(
        sorted.length - 1,
        Math.max(0, Math.floor(q * (sorted.length - 1)))
      );
      return sorted[idx];
    };
    return {
      totalAttempts: this.attempts,
      totalRetries: this.retries,
      errors: this.errors,
      statuses: { ...this.statuses },
      latenciesMs: {
        p50: pick(0.5),
        p95: pick(0.95),
        max: sorted[sorted.length - 1] || 0,
      },
    };
  }
}
