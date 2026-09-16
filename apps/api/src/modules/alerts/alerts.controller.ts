import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { uuidParam, zodBody, zodQuery } from '../../common/validation/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth-user';
import {
  activeAlertsQuerySchema,
  issueAlertSchema,
  type ActiveAlertsQuery,
  type IssueAlertInput,
} from './alerts.schemas';
import { AlertsService } from './alerts.service';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Post()
  @Roles('GOVT_OFFICIAL')
  issue(@Body(zodBody(issueAlertSchema)) body: IssueAlertInput, @CurrentUser() user: AuthUser) {
    return this.alerts.issue(body, user);
  }

  @Get()
  @Roles('GOVT_OFFICIAL')
  history(@CurrentUser() user: AuthUser) {
    return this.alerts.history(user);
  }

  @Get('active')
  active(@Query(zodQuery(activeAlertsQuerySchema)) query: ActiveAlertsQuery, @CurrentUser() user: AuthUser) {
    return this.alerts.active(query, user);
  }

  @Post(':id/cancel')
  @Roles('GOVT_OFFICIAL')
  cancel(@Param('id', uuidParam) id: string, @CurrentUser() user: AuthUser) {
    return this.alerts.cancel(id, user);
  }
}
