import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { REVIEW_REASONS } from '../../common/domain/enums';
import { DomainEventBus, rooms } from '../../common/events/domain-event-bus';
import { uuidParam, zodBody, zodQuery } from '../../common/validation/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth-user';
import { IncidentsService } from './incidents.service';
import { ReviewsRepository } from './reviews.repository';

const flagSchema = z.object({
  reason: z.enum(REVIEW_REASONS),
  relatedIncidentId: z.uuid().optional(),
  note: z.string().trim().max(1000).optional(),
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const resolveSchema = z
  .object({
    resolutionNote: z.string().trim().min(1).max(1000),
    incidentStatus: z.enum(['VERIFIED', 'RESOLVED', 'REJECTED_DUPLICATE', 'REJECTED_FAKE']).optional(),
    duplicateOf: z.uuid().optional(),
  })
  .refine((value) => (value.incidentStatus === 'REJECTED_DUPLICATE') === (value.duplicateOf !== undefined), {
    message: 'duplicateOf is required for REJECTED_DUPLICATE and not allowed otherwise',
    path: ['duplicateOf'],
  });

@Controller()
@Roles('GOVT_OFFICIAL')
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsRepository,
    private readonly incidents: IncidentsService,
    private readonly events: DomainEventBus,
  ) {}

  @Post('incidents/:id/flags')
  async flag(
    @Param('id', uuidParam) incidentId: string,
    @Body(zodBody(flagSchema)) body: z.infer<typeof flagSchema>,
    @CurrentUser() user: AuthUser,
  ) {
    const incident = await this.incidents.findVisible(incidentId, user);
    const review = await this.reviews.create({
      incidentId,
      reason: body.reason,
      relatedIncidentId: body.relatedIncidentId ?? null,
      details: body.note ? { note: body.note } : {},
      flaggedBy: user.id,
    });
    if (!review) {
      throw new ConflictException({ code: 'REVIEW_ALREADY_PENDING', message: 'This reason is already under review' });
    }

    this.events.publish({ name: 'review:created', rooms: [rooms.district(incident.districtId)], payload: review });
    return review;
  }

  @Get('reviews')
  list(@Query(zodQuery(listSchema)) query: z.infer<typeof listSchema>, @CurrentUser() user: AuthUser) {
    if (user.districtId === null) {
      throw new ForbiddenException({ code: 'NO_DISTRICT_SCOPE', message: 'Your account is not assigned to a district' });
    }
    return this.reviews.listPending(user.districtId, query.limit);
  }

  // Resolving is the human decision the review queue exists for: any rejection happens
  // here, attributed to the official, never automatically.
  @Post('reviews/:id/resolve')
  async resolve(
    @Param('id', uuidParam) id: string,
    @Body(zodBody(resolveSchema)) body: z.infer<typeof resolveSchema>,
    @CurrentUser() user: AuthUser,
  ) {
    const review = await this.reviews.findById(id);
    if (!review || review.districtId !== user.districtId) {
      throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Review not found' });
    }
    if (review.status !== 'PENDING') {
      throw new ConflictException({ code: 'REVIEW_ALREADY_RESOLVED', message: 'This review is already resolved' });
    }

    if (body.incidentStatus) {
      await this.incidents.changeStatus(
        review.incidentId,
        { status: body.incidentStatus, note: body.resolutionNote, duplicateOf: body.duplicateOf },
        user,
      );
    }

    const resolved = await this.reviews.resolve(id, user.id, body.resolutionNote);
    if (!resolved) {
      throw new ConflictException({ code: 'REVIEW_ALREADY_RESOLVED', message: 'This review is already resolved' });
    }

    this.events.publish({ name: 'review:resolved', rooms: [rooms.district(review.districtId)], payload: resolved });
    return resolved;
  }
}
