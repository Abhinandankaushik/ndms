import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_POLICY = 'ndms:rateLimitPolicy';

export interface RateLimitPolicy {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

// Opt-in, so the SOS and offline-sync routes stay unlimited by leaving it off. Signed-in
// requests count per user; public routes count per client IP.
export const RateLimit = (policy: RateLimitPolicy) => SetMetadata(RATE_LIMIT_POLICY, policy);
