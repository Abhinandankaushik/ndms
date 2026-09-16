import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { zodBody } from '../../common/validation/zod-validation.pipe';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth-user';
import { syncRequestSchema, type SyncRequest } from './sync.schemas';
import { SyncService } from './sync.service';

@Controller('incidents/sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post()
  @HttpCode(200)
  syncOutbox(@Body(zodBody(syncRequestSchema)) body: SyncRequest, @CurrentUser() user: AuthUser) {
    return this.sync.syncBatch(body.items, user);
  }
}
