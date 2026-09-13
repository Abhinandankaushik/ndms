import type { Request } from 'express';
import type { UserRole } from '../../common/domain/enums';

export interface AuthUser {
  id: string;
  role: UserRole;
  districtId: number | null;
  rescueTeamId: string | null;
  facilityId: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
