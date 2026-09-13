import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { createHash, timingSafeEqual } from 'node:crypto';
import { REDIS } from '../../infra/redis/redis.module';

export const OTP_TTL_SECONDS = 300;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_SECONDS = 900;

const keys = {
  code: (phone: string) => `otp:code:${phone}`,
  attempts: (phone: string) => `otp:attempts:${phone}`,
  sends: (phone: string) => `otp:sends:${phone}`,
};

const digest = (phone: string, code: string) => createHash('sha256').update(`${phone}:${code}`).digest();

@Injectable()
export class OtpStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async issue(phone: string, code: string): Promise<void> {
    const sends = await this.redis.incr(keys.sends(phone));
    if (sends === 1) await this.redis.expire(keys.sends(phone), SEND_WINDOW_SECONDS);
    if (sends > MAX_SENDS_PER_WINDOW) {
      throw new HttpException(
        { code: 'OTP_RATE_LIMITED', message: 'Too many OTP requests. Try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.redis
      .multi()
      .set(keys.code(phone), digest(phone, code).toString('hex'), 'EX', OTP_TTL_SECONDS)
      .del(keys.attempts(phone))
      .exec();
  }

  async consume(phone: string, code: string): Promise<boolean> {
    const attempts = await this.redis.incr(keys.attempts(phone));
    if (attempts === 1) await this.redis.expire(keys.attempts(phone), OTP_TTL_SECONDS);
    if (attempts > MAX_VERIFY_ATTEMPTS) {
      await this.redis.del(keys.code(phone));
      throw new HttpException(
        { code: 'OTP_LOCKED', message: 'Too many wrong codes. Request a new OTP.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const stored = await this.redis.get(keys.code(phone));
    if (!stored || !timingSafeEqual(Buffer.from(stored, 'hex'), digest(phone, code))) {
      return false;
    }

    await this.redis.del(keys.code(phone), keys.attempts(phone));
    return true;
  }
}
