import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { uuidParam, zodBody } from '../../common/validation/zod-validation.pipe';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth-user';
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, MediaService, type AllowedImageType } from './media.service';

const presignSchema = z.object({
  incidentId: z.uuid(),
  contentType: z.enum(Object.keys(ALLOWED_IMAGE_TYPES) as [AllowedImageType, ...AllowedImageType[]]),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

const confirmSchema = z.object({ mediaId: z.uuid() });

@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('media/presign')
  presign(@Body(zodBody(presignSchema)) body: z.infer<typeof presignSchema>, @CurrentUser() user: AuthUser) {
    return this.media.presign(body, user);
  }

  @Post('media/confirm')
  confirm(@Body(zodBody(confirmSchema)) body: z.infer<typeof confirmSchema>, @CurrentUser() user: AuthUser) {
    return this.media.confirm(body.mediaId, user);
  }

  @Get('incidents/:id/media')
  list(@Param('id', uuidParam) incidentId: string, @CurrentUser() user: AuthUser) {
    return this.media.listForIncident(incidentId, user);
  }
}
