// ═══════════════════════════════════════════════════════════
// MIMIR — Rate Limiter
// Prevent runaway API costs
// ═══════════════════════════════════════════════════════════

/** Rate limiter — prevent runaway API costs */
export class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private totalCost: number = 0;
  private readonly maxDailyCost: number;
  private costResetAt: number;

  constructor(options: {
    maxRequestsPerMinute?: number;
    maxDailyCostUSD?: number;
  } = {}) {
    this.maxRequests = options.maxRequestsPerMinute || 20;
    this.windowMs = 60_000; // 1 minute
    this.maxDailyCost = options.maxDailyCostUSD || 5.0;
    this.costResetAt = Date.now() + 24 * 60 * 60 * 1000;
  }

  /** Check if a request is allowed */
  canRequest(): { allowed: boolean; reason?: string; retryAfterMs?: number } {
    this.cleanup();

    // Check rate limit
    if (this.requests.length >= this.maxRequests) {
      const oldestInWindow = this.requests[0];
      const retryAfterMs = oldestInWindow + this.windowMs - Date.now();
      return {
        allowed: false,
        reason: `Rate limit: ${this.maxRequests} requests/minute exceeded`,
        retryAfterMs,
      };
    }

    // Check daily cost
    if (this.totalCost >= this.maxDailyCost) {
      return {
        allowed: false,
        reason: `Daily cost limit of $${this.maxDailyCost} reached. Resets at ${new Date(this.costResetAt).toLocaleTimeString()}`,
      };
    }

    return { allowed: true };
  }

  /** Record a request */
  recordRequest(estimatedCostUSD: number = 0.01): void {
    this.requests.push(Date.now());
    this.totalCost += estimatedCostUSD;

    // Reset daily cost if past reset time
    if (Date.now() > this.costResetAt) {
      this.totalCost = 0;
      this.costResetAt = Date.now() + 24 * 60 * 60 * 1000;
    }
  }

  /** Clean up old request timestamps */
  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    this.requests = this.requests.filter(t => t > cutoff);
  }

  /** Get current status */
  getStatus(): { requestsInWindow: number; dailyCostUSD: number } {
    this.cleanup();
    return {
      requestsInWindow: this.requests.length,
      dailyCostUSD: Math.round(this.totalCost * 100) / 100,
    };
  }
}
