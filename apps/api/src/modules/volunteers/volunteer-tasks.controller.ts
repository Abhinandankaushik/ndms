import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { uuidParam, zodBody, zodQuery } from '../../common/validation/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth-user';
import { VolunteerTasksService } from './volunteer-tasks.service';
import {
  createTaskSchema,
  listTasksQuerySchema,
  type CreateTaskInput,
  type ListTasksQuery,
} from './volunteers.schemas';

// Volunteer routes admit CITIZEN as well: the service checks verification in the database,
// because a volunteer's token keeps the CITIZEN role until it is refreshed.
@Controller('volunteer-tasks')
export class VolunteerTasksController {
  constructor(private readonly tasks: VolunteerTasksService) {}

  @Post()
  @Roles('GOVT_OFFICIAL', 'FACILITY_MANAGER')
  create(@Body(zodBody(createTaskSchema)) body: CreateTaskInput, @CurrentUser() user: AuthUser) {
    return this.tasks.create(body, user);
  }

  @Get()
  @Roles('GOVT_OFFICIAL')
  list(@Query(zodQuery(listTasksQuerySchema)) query: ListTasksQuery, @CurrentUser() user: AuthUser) {
    return this.tasks.list(query, user);
  }

  @Get('nearby')
  @Roles('CITIZEN', 'VOLUNTEER')
  nearby(@CurrentUser() user: AuthUser) {
    return this.tasks.nearby(user);
  }

  @Get('mine')
  @Roles('CITIZEN', 'VOLUNTEER')
  mine(@CurrentUser() user: AuthUser) {
    return this.tasks.mine(user);
  }

  @Post(':id/accept')
  @Roles('CITIZEN', 'VOLUNTEER')
  accept(@Param('id', uuidParam) id: string, @CurrentUser() user: AuthUser) {
    return this.tasks.accept(id, user);
  }

  @Post(':id/complete')
  complete(@Param('id', uuidParam) id: string, @CurrentUser() user: AuthUser) {
    return this.tasks.complete(id, user);
  }

  @Post(':id/cancel')
  @Roles('GOVT_OFFICIAL', 'FACILITY_MANAGER')
  cancel(@Param('id', uuidParam) id: string, @CurrentUser() user: AuthUser) {
    return this.tasks.cancel(id, user);
  }
}
