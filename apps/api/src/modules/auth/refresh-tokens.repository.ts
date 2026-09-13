import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';

export interface NewRefreshToken {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
}

@Injectable()
export class RefreshTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(token: NewRefreshToken): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent)
      VALUES (${token.userId}::uuid, ${token.familyId}::uuid, ${token.tokenHash}, ${token.expiresAt}::timestamptz, ${token.userAgent})`;
  }

  // Marking the token rotated in the same statement that checks it makes two concurrent
  // refreshes with one token race safely: only one of them gets a row back.
  async rotate(tokenHash: string): Promise<{ userId: string; familyId: string } | null> {
    const rows = await this.prisma.$queryRaw<{ user_id: string; family_id: string }[]>`
      UPDATE refresh_tokens SET rotated_at = now()
      WHERE token_hash = ${tokenHash}
        AND rotated_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > now()
      RETURNING user_id, family_id`;
    const row = rows[0];
    return row ? { userId: row.user_id, familyId: row.family_id } : null;
  }

  async findByHash(tokenHash: string): Promise<{ familyId: string; rotated: boolean } | null> {
    const rows = await this.prisma.$queryRaw<{ family_id: string; rotated: boolean }[]>`
      SELECT family_id, rotated_at IS NOT NULL AS rotated
      FROM refresh_tokens
      WHERE token_hash = ${tokenHash}`;
    const row = rows[0];
    return row ? { familyId: row.family_id, rotated: row.rotated } : null;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE refresh_tokens SET revoked_at = now()
      WHERE family_id = ${familyId}::uuid AND revoked_at IS NULL`;
  }
}
