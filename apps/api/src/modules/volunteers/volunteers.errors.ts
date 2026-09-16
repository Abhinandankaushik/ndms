import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';

export const volunteerNotFound = () =>
  new NotFoundException({ code: 'VOLUNTEER_NOT_FOUND', message: 'Volunteer profile not found' });

export const volunteerNotVerified = () =>
  new ForbiddenException({ code: 'VOLUNTEER_NOT_VERIFIED', message: 'Only verified volunteers can take tasks' });

export const taskNotFound = () => new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Task not found' });

export const locationOutsideDistrict = (message: string) =>
  new UnprocessableEntityException({ code: 'LOCATION_OUTSIDE_DISTRICT', message });

export function requireDistrict(user: AuthUser): number {
  if (user.districtId === null) {
    throw new ForbiddenException({ code: 'NO_DISTRICT_SCOPE', message: 'Your account is not assigned to a district' });
  }
  return user.districtId;
}
