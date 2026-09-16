import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { zodQuery } from '../../common/validation/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth-user';
import { DashboardRepository } from './dashboard.repository';
import { heatmapQuerySchema, type HeatmapQuery } from './dashboard.schemas';

const scopedDistrict = (user: AuthUser): number => {
  if (user.districtId === null) {
    throw new ForbiddenException({ code: 'NO_DISTRICT_SCOPE', message: 'Your account is not assigned to a district' });
  }
  return user.districtId;
};

@Controller('dashboard')
@Roles('GOVT_OFFICIAL')
export class DashboardController {
  constructor(private readonly dashboard: DashboardRepository) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(scopedDistrict(user));
  }

  @Get('heatmap')
  heatmap(@Query(zodQuery(heatmapQuerySchema)) query: HeatmapQuery, @CurrentUser() user: AuthUser) {
    return this.dashboard.heatmap(scopedDistrict(user), query);
  }

  @Get('resources')
  resources(@CurrentUser() user: AuthUser) {
    return this.dashboard.resources(scopedDistrict(user));
  }
}
