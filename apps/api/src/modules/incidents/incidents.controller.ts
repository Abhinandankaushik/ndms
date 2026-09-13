import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { uuidParam, zodBody, zodQuery } from '../../common/validation/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth-user';
import {
  mapQuerySchema,
  queueQuerySchema,
  reportSchema,
  sosSchema,
  statusChangeSchema,
  updateDetailsSchema,
  type MapQuery,
  type QueueQuery,
  type ReportInput,
  type SosInput,
  type StatusChangeInput,
  type UpdateDetailsInput,
} from './incidents.schemas';
import { IncidentsService, type ReportReceipt } from './incidents.service';

const withStatus = (response: Response, receipt: ReportReceipt) => {
  response.status(receipt.wasInserted ? 201 : 200);
  return receipt;
};

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post('sos')
  async sos(
    @Body(zodBody(sosSchema)) body: SosInput,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withStatus(response, await this.incidents.reportSos(body, user));
  }

  @Post()
  async report(
    @Body(zodBody(reportSchema)) body: ReportInput,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withStatus(response, await this.incidents.reportDetailed(body, user));
  }

  @Get()
  @Roles('GOVT_OFFICIAL', 'RESCUE_TEAM')
  map(@Query(zodQuery(mapQuerySchema)) query: MapQuery, @CurrentUser() user: AuthUser) {
    return this.incidents.map(query, user);
  }

  @Get('queue')
  @Roles('GOVT_OFFICIAL', 'RESCUE_TEAM')
  queue(@Query(zodQuery(queueQuerySchema)) query: QueueQuery, @CurrentUser() user: AuthUser) {
    return this.incidents.queue(query, user);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.incidents.mine(user);
  }

  @Get(':id')
  detail(@Param('id', uuidParam) id: string, @CurrentUser() user: AuthUser) {
    return this.incidents.detail(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', uuidParam) id: string,
    @Body(zodBody(updateDetailsSchema)) body: UpdateDetailsInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.incidents.updateDetails(id, body, user);
  }

  @Patch(':id/status')
  @Roles('GOVT_OFFICIAL', 'RESCUE_TEAM')
  changeStatus(
    @Param('id', uuidParam) id: string,
    @Body(zodBody(statusChangeSchema)) body: StatusChangeInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.incidents.changeStatus(id, body, user);
  }
}
