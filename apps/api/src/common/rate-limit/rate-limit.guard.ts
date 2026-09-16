import { HttpException, HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { IS_PUBLIC } from '../../modules/auth/auth.decorators';
import type { AuthenticatedRequest } from '../../modules/auth/auth-user';
import { TokenService } from '../../modules/auth/token.service';
import { RATE_LIMIT_POLICY, type RateLimitPolicy } from './rate-limit.decorator';
import { SlidingWindowLimiter } from './sliding-window.limiter';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: SlidingWindowLimiter,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const policy = this.metadata<RateLimitPolicy>(RATE_LIMIT_POLICY, context);
    if (!policy) return true;

    const http = context.switchToHttp();
    const subject = await this.subjectOf(http.getRequest<AuthenticatedRequest>(), context);
    const decision = await this.limiter.consume(`${policy.bucket}:${subject}`, policy.limit, policy.windowSeconds);
    if (decision.allowed) return true;

    http.getResponse<Response>().setHeader('Retry-After', String(decision.retryAfterSeconds));
    throw new HttpException(
      {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Try again later.',
        details: { retryAfterSeconds: decision.retryAfterSeconds },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async subjectOf(request: AuthenticatedRequest, context: ExecutionContext): Promise<string> {
    const userId = request.user?.id ?? (await this.bearerUserId(request, context));
    return userId ? `user:${userId}` : `ip:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`;
  }

  // Global guards run in module import order, so this guard may run before JwtAuthGuard has
  // attached the user. Public routes stay keyed by IP, so presenting a token cannot move a
  // login attempt into a fresh bucket.
  private async bearerUserId(request: AuthenticatedRequest, context: ExecutionContext): Promise<string | null> {
    const header = request.headers.authorization;
    if (this.metadata<boolean>(IS_PUBLIC, context) || !header?.startsWith('Bearer ')) return null;
    try {
      return (await this.tokens.verifyAccessToken(header.slice('Bearer '.length))).id;
    } catch {
      return null;
    }
  }

  private metadata<T>(key: string, context: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T | undefined>(key, [context.getHandler(), context.getClass()]);
  }
}
