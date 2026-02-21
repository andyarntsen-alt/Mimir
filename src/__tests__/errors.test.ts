// ═══════════════════════════════════════════════════════════
// MIMIR — Rate Limiter Tests
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../core/errors.js';

describe('RateLimiter', () => {
  it('should allow requests within limits', () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 5 });
    const check = limiter.canRequest();
    expect(check.allowed).toBe(true);
  });

  it('should block requests over rate limit', () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 3 });

    limiter.recordRequest();
    limiter.recordRequest();
    limiter.recordRequest();

    const check = limiter.canRequest();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Rate limit');
  });

  it('should block requests over daily cost', () => {
    const limiter = new RateLimiter({ maxDailyCostUSD: 0.05 });

    limiter.recordRequest(0.03);
    limiter.recordRequest(0.03);

    const check = limiter.canRequest();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('cost limit');
  });

  it('should report status', () => {
    const limiter = new RateLimiter();
    limiter.recordRequest(0.01);
    limiter.recordRequest(0.02);

    const status = limiter.getStatus();
    expect(status.requestsInWindow).toBe(2);
    expect(status.dailyCostUSD).toBe(0.03);
  });
});
