import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { zodBody, zodQuery } from '../../common/validation/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth-user';
import {
  nearestTeamsQuerySchema,
  teamLocationSchema,
  type NearestTeamsQueryInput,
  type TeamLocationInput,
} from './missions.schemas';
import { TeamLocationService } from './team-location.service';
import { TeamsService } from './teams.service';

@Controller('teams')
export class TeamsController {
  constructor(
    private readonly teams: TeamsService,
    private readonly locations: TeamLocationService,
  ) {}

  @Get()
  @Roles('GOVT_OFFICIAL')
  list(@CurrentUser() user: AuthUser) {
    return this.teams.list(user);
  }

  @Get('nearest')
  @Roles('GOVT_OFFICIAL')
  nearest(@Query(zodQuery(nearestTeamsQuerySchema)) query: NearestTeamsQueryInput, @CurrentUser() user: AuthUser) {
    return this.teams.nearest(query, user);
  }

  @Post('me/location')
  @Roles('RESCUE_TEAM')
  @HttpCode(HttpStatus.ACCEPTED)
  recordLocation(@Body(zodBody(teamLocationSchema)) body: TeamLocationInput, @CurrentUser() user: AuthUser) {
    return this.locations.record(body, user);
  }
}
