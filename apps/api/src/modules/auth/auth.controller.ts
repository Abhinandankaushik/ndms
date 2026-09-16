import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { zodBody } from '../../common/validation/zod-validation.pipe';
import { ENV, type Env } from '../../config/env';
import type { UserRecord } from '../users/users.repository';
import { CurrentUser, Public } from './auth.decorators';
import {
  sendOtpSchema,
  updateMeSchema,
  verifyOtpSchema,
  type SendOtpInput,
  type UpdateMeInput,
  type VerifyOtpInput,
} from './auth.schemas';
import { AuthService, type Session } from './auth.service';
import type { AuthUser } from './auth-user';

export const REFRESH_COOKIE = 'ndms_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

const toProfile = (user: UserRecord) => ({
  id: user.id,
  phone: user.phone,
  fullName: user.fullName,
  role: user.role,
  districtId: user.districtId,
  rescueTeamId: user.rescueTeamId,
  facilityId: user.facilityId,
});

const toSessionResponse = (session: Session) => ({
  accessToken: session.accessToken,
  tokenType: 'Bearer' as const,
  expiresInSeconds: session.expiresInSeconds,
  user: toProfile(session.user),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post('otp/send')
  @HttpCode(200)
  sendOtp(@Body(zodBody(sendOtpSchema)) body: SendOtpInput) {
    return this.auth.sendOtp(body.phone);
  }

  @Public()
  @RateLimit({ bucket: 'otp-verify', limit: 10, windowSeconds: 15 * 60 })
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(
    @Body(zodBody(verifyOtpSchema)) body: VerifyOtpInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.verifyOtp(body.phone, body.code, request.get('user-agent') ?? null);
    this.setRefreshCookie(response, session);
    return toSessionResponse(session);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = this.readRefreshCookie(request);
    if (!token) {
      throw new UnauthorizedException({ code: 'REFRESH_MISSING', message: 'No session to refresh' });
    }
    try {
      const session = await this.auth.refresh(token, request.get('user-agent') ?? null);
      this.setRefreshCookie(response, session);
      return toSessionResponse(session);
    } catch (error) {
      this.clearRefreshCookie(response);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = this.readRefreshCookie(request);
    if (token) {
      await this.auth.logout(token);
    }
    this.clearRefreshCookie(response);
    return { loggedOut: true };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return toProfile(await this.auth.profile(user.id));
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: AuthUser, @Body(zodBody(updateMeSchema)) body: UpdateMeInput) {
    return toProfile(await this.auth.updateFullName(user.id, body.fullName));
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  private setRefreshCookie(response: Response, session: Session): void {
    response.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    });
  }
}
