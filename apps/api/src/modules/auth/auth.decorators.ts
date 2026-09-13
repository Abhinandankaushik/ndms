import { createParamDecorator, SetMetadata, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '../../common/domain/enums';
import type { AuthenticatedRequest, AuthUser } from './auth-user';

export const IS_PUBLIC = 'ndms:isPublic';
export const REQUIRED_ROLES = 'ndms:requiredRoles';

export const Public = () => SetMetadata(IS_PUBLIC, true);

export const Roles = (...roles: UserRole[]) => SetMetadata(REQUIRED_ROLES, roles);

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) {
    throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Authentication required' });
  }
  return user;
});
