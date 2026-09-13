import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { ENV, type Env } from '../../config/env';
import { UsersRepository, type UserRecord } from '../users/users.repository';
import type { AuthUser } from './auth-user';
import { OTP_TTL_SECONDS, OtpStore } from './otp.store';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { hashRefreshToken, TokenService } from './token.service';

export interface Session {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: UserRecord;
}

export const toAuthUser = (user: UserRecord): AuthUser => ({
  id: user.id,
  role: user.role,
  districtId: user.districtId,
  rescueTeamId: user.rescueTeamId,
  facilityId: user.facilityId,
});

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly otp: OtpStore,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly users: UsersRepository,
  ) {
    if (env.OTP_DEV_CODE) {
      this.logger.warn('OTP_DEV_CODE is set: every login accepts that fixed code. Never use this with real users.');
    }
  }

  async sendOtp(phone: string): Promise<{ expiresInSeconds: number }> {
    const code = this.env.OTP_DEV_CODE ?? randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.withOtpStore(() => this.otp.issue(phone, code));
    if (!this.env.OTP_DEV_CODE && this.env.NODE_ENV !== 'production') {
      this.logger.log(`No SMS gateway in this build; OTP for ${phone} is ${code}`);
    }
    return { expiresInSeconds: OTP_TTL_SECONDS };
  }

  async verifyOtp(phone: string, code: string, userAgent: string | null): Promise<Session> {
    const valid = await this.withOtpStore(() => this.otp.consume(phone, code));
    if (!valid) {
      throw new UnauthorizedException({ code: 'OTP_INVALID', message: 'The code is wrong or has expired' });
    }

    const user = await this.users.upsertVerifiedByPhone(phone);
    if (!user.isActive) {
      throw new ForbiddenException({ code: 'ACCOUNT_DISABLED', message: 'This account is disabled' });
    }
    return this.issueSession(user, randomUUID(), userAgent);
  }

  async refresh(refreshToken: string, userAgent: string | null): Promise<Session> {
    const tokenHash = hashRefreshToken(refreshToken);
    const rotated = await this.refreshTokens.rotate(tokenHash);

    if (!rotated) {
      const existing = await this.refreshTokens.findByHash(tokenHash);
      if (existing?.rotated) {
        await this.refreshTokens.revokeFamily(existing.familyId);
        this.logger.warn(`Refresh token reuse detected; revoked token family ${existing.familyId}`);
        throw new UnauthorizedException({ code: 'REFRESH_REUSED', message: 'Session revoked. Please log in again.' });
      }
      throw new UnauthorizedException({ code: 'REFRESH_INVALID', message: 'Session expired. Please log in again.' });
    }

    const user = await this.users.findById(rotated.userId);
    if (!user?.isActive) {
      await this.refreshTokens.revokeFamily(rotated.familyId);
      throw new UnauthorizedException({ code: 'REFRESH_INVALID', message: 'Session expired. Please log in again.' });
    }
    return this.issueSession(user, rotated.familyId, userAgent);
  }

  async logout(refreshToken: string): Promise<void> {
    const existing = await this.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (existing) {
      await this.refreshTokens.revokeFamily(existing.familyId);
    }
  }

  async profile(userId: string): Promise<UserRecord> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    return user;
  }

  async updateFullName(userId: string, fullName: string): Promise<UserRecord> {
    const user = await this.users.updateFullName(userId, fullName);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    return user;
  }

  private async issueSession(user: UserRecord, familyId: string, userAgent: string | null): Promise<Session> {
    const accessToken = await this.tokens.issueAccessToken(toAuthUser(user));
    const { token, hash } = this.tokens.newRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

    await this.refreshTokens.create({ userId: user.id, familyId, tokenHash: hash, expiresAt: refreshExpiresAt, userAgent });

    return {
      accessToken,
      expiresInSeconds: this.tokens.accessTokenTtlSeconds,
      refreshToken: token,
      refreshExpiresAt,
      user,
    };
  }

  private async withOtpStore<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`OTP store unavailable: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException({
        code: 'OTP_UNAVAILABLE',
        message: 'Login is temporarily unavailable. Try again shortly.',
      });
    }
  }
}
