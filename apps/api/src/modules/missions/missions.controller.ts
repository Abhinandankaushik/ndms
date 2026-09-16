import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { uuidParam, zodBody, zodQuery } from '../../common/validation/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth-user';
import {
  assignMissionSchema,
  missionListQuerySchema,
  missionStatusChangeSchema,
  type AssignMissionInput,
  type MissionListQuery,
  type MissionStatusChangeInput,
} from './missions.schemas';
import { MissionsService } from './missions.service';

@Controller('missions')
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Post()
  @Roles('GOVT_OFFICIAL')
  assign(@Body(zodBody(assignMissionSchema)) body: AssignMissionInput, @CurrentUser() user: AuthUser) {
    return this.missions.assign(body, user);
  }

  @Get()
  @Roles('GOVT_OFFICIAL')
  list(@Query(zodQuery(missionListQuerySchema)) query: MissionListQuery, @CurrentUser() user: AuthUser) {
    return this.missions.list(query, user);
  }

  @Get('mine')
  @Roles('RESCUE_TEAM')
  mine(@CurrentUser() user: AuthUser) {
    return this.missions.mine(user);
  }

  @Get(':id')
  @Roles('GOVT_OFFICIAL', 'RESCUE_TEAM')
  detail(@Param('id', uuidParam) id: string, @CurrentUser() user: AuthUser, @Ip() ip: string | undefined) {
    return this.missions.detail(id, user, ip ?? null);
  }

  @Patch(':id/status')
  @Roles('GOVT_OFFICIAL', 'RESCUE_TEAM')
  changeStatus(
    @Param('id', uuidParam) id: string,
    @Body(zodBody(missionStatusChangeSchema)) body: MissionStatusChangeInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.missions.changeStatus(id, body, user);
  }
}
