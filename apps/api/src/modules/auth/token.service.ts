import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { USER_ROLES } from '../../common/domain/enums';
import { ENV, type Env } from '../../config/env';
import type { AuthUser } from './auth-user';

const ISSUER = 'ndms-api';
const AUDIENCE = 'ndms';

const accessClaimsSchema = z.object({
  sub: z.uuid(),
  role: z.enum(USER_ROLES),
  did: z.number().int().nullable(),
  tid: z.uuid().nullable(),
  fid: z.uuid().nullable(),
});

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  get accessTokenTtlSeconds(): number {
    return this.env.JWT_ACCESS_TTL_SECONDS;
  }

  issueAccessToken(user: AuthUser): Promise<string> {
    return new SignJWT({ role: user.role, did: user.districtId, tid: user.rescueTeamId, fid: user.facilityId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.env.JWT_ACCESS_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      const claims = accessClaimsSchema.parse(payload);
      return {
        id: claims.sub,
        role: claims.role,
        districtId: claims.did,
        rescueTeamId: claims.tid,
        facilityId: claims.fid,
      };
    } catch {
      throw new UnauthorizedException({ code: 'TOKEN_INVALID', message: 'Access token is invalid or expired' });
    }
  }

  newRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: hashRefreshToken(token) };
  }
}
