import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { uuidParam, zodBody, zodQuery } from '../../common/validation/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth-user';
import { VolunteerDocumentsService } from './volunteer-documents.service';
import {
  confirmDocumentSchema,
  listVolunteersQuerySchema,
  presignDocumentSchema,
  registerSchema,
  reviewSchema,
  updateProfileSchema,
  type ConfirmDocumentInput,
  type ListVolunteersQuery,
  type PresignDocumentInput,
  type RegisterInput,
  type ReviewInput,
  type UpdateProfileInput,
} from './volunteers.schemas';
import { VolunteersService } from './volunteers.service';

@Controller('volunteers')
export class VolunteersController {
  constructor(
    private readonly volunteers: VolunteersService,
    private readonly documents: VolunteerDocumentsService,
  ) {}

  @Post('register')
  @Roles('CITIZEN', 'VOLUNTEER')
  register(@Body(zodBody(registerSchema)) body: RegisterInput, @CurrentUser() user: AuthUser) {
    return this.volunteers.register(body, user);
  }

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.volunteers.mine(user);
  }

  @Patch('me')
  update(@Body(zodBody(updateProfileSchema)) body: UpdateProfileInput, @CurrentUser() user: AuthUser) {
    return this.volunteers.update(body, user);
  }

  @Post('me/documents/presign')
  presignDocument(@Body(zodBody(presignDocumentSchema)) body: PresignDocumentInput, @CurrentUser() user: AuthUser) {
    return this.documents.presign(body, user);
  }

  @Post('me/documents/confirm')
  confirmDocument(@Body(zodBody(confirmDocumentSchema)) body: ConfirmDocumentInput, @CurrentUser() user: AuthUser) {
    return this.documents.confirm(body.mediaId, user);
  }

  @Get()
  @Roles('GOVT_OFFICIAL')
  list(
    @Query(zodQuery(listVolunteersQuerySchema)) query: ListVolunteersQuery,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress: string | undefined,
  ) {
    return this.volunteers.listForReview(query, user, ipAddress ?? null);
  }

  @Post(':userId/review')
  @Roles('GOVT_OFFICIAL')
  review(
    @Param('userId', uuidParam) userId: string,
    @Body(zodBody(reviewSchema)) body: ReviewInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.volunteers.review(userId, body, user);
  }
}
