import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Public } from '../../modules/auth/auth.decorators';
import type { AuthUser } from '../../modules/auth/auth-user';
import type { TokenService } from '../../modules/auth/token.service';
import { RateLimit } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import type { RateLimitDecision, SlidingWindowLimiter } from './sliding-window.limiter';

class ProbeController {
  @RateLimit({ bucket: 'reports', limit: 10, windowSeconds: 3_600 })
  report() {}

  @Public()
  @RateLimit({ bucket: 'logins', limit: 10, windowSeconds: 900 })
  login() {}

  sos() {}
}

const CITIZEN: AuthUser = {
  id: '6f1d7c52-8a0e-4c1b-9a53-2f4f1b0f3a11',
  role: 'CITIZEN',
  districtId: null,
  rescueTeamId: null,
  facilityId: null,
};

interface ProbeRequest {
  ip: string;
  headers: { authorization?: string };
  user?: AuthUser;
}

describe('RateLimitGuard', () => {
  let consume: jest.Mock<Promise<RateLimitDecision>, [string, number, number]>;
  let verifyAccessToken: jest.Mock<Promise<AuthUser>, [string]>;
  let setHeader: jest.Mock;
  let guard: RateLimitGuard;

  const contextFor = (handler: keyof ProbeController, request: ProbeRequest) =>
    ({
      getType: () => 'http',
      getHandler: () => ProbeController.prototype[handler],
      getClass: () => ProbeController,
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ setHeader }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    consume = jest.fn<Promise<RateLimitDecision>, [string, number, number]>(async () => ({ allowed: true }));
    verifyAccessToken = jest.fn<Promise<AuthUser>, [string]>(async () => CITIZEN);
    setHeader = jest.fn();
    guard = new RateLimitGuard(
      new Reflector(),
      { consume } as unknown as SlidingWindowLimiter,
      { verifyAccessToken } as unknown as TokenService,
    );
  });

  it('leaves routes without @RateLimit alone', async () => {
    await expect(guard.canActivate(contextFor('sos', { ip: '10.0.0.7', headers: {} }))).resolves.toBe(true);

    expect(consume).not.toHaveBeenCalled();
  });

  it('counts an authenticated request against its user', async () => {
    await guard.canActivate(contextFor('report', { ip: '10.0.0.7', headers: {}, user: CITIZEN }));

    expect(consume).toHaveBeenCalledWith(`reports:user:${CITIZEN.id}`, 10, 3_600);
  });

  it('finds the user from the bearer token when it runs before the JWT guard', async () => {
    await guard.canActivate(contextFor('report', { ip: '10.0.0.7', headers: { authorization: 'Bearer valid' } }));

    expect(verifyAccessToken).toHaveBeenCalledWith('valid');
    expect(consume).toHaveBeenCalledWith(`reports:user:${CITIZEN.id}`, 10, 3_600);
  });

  it('falls back to the client IP when the bearer token does not verify', async () => {
    verifyAccessToken.mockRejectedValue(new Error('TOKEN_INVALID'));

    await guard.canActivate(contextFor('report', { ip: '10.0.0.7', headers: { authorization: 'Bearer forged' } }));

    expect(consume).toHaveBeenCalledWith('reports:ip:10.0.0.7', 10, 3_600);
  });

  it('keys public routes by IP even when a token is presented', async () => {
    await guard.canActivate(contextFor('login', { ip: '10.0.0.7', headers: { authorization: 'Bearer valid' } }));

    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(consume).toHaveBeenCalledWith('logins:ip:10.0.0.7', 10, 900);
  });

  it('refuses with 429 RATE_LIMITED, the wait in details and a Retry-After header', async () => {
    consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });

    const refusal = guard.canActivate(contextFor('report', { ip: '10.0.0.7', headers: {}, user: CITIZEN }));

    await expect(refusal).rejects.toBeInstanceOf(HttpException);
    await expect(refusal).rejects.toMatchObject({
      status: 429,
      response: { code: 'RATE_LIMITED', details: { retryAfterSeconds: 42 } },
    });
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '42');
  });
});
