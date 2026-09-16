import { ConflictException, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { DomainEventBus, rooms } from '../../common/events/domain-event-bus';
import type { LatLon } from '../../common/geo/geo-sql';
import type { AuthUser } from '../auth/auth-user';
import { VolunteerDocumentsService, type DocumentLink } from './volunteer-documents.service';
import { locationOutsideDistrict, requireDistrict, volunteerNotFound } from './volunteers.errors';
import { VolunteersRepository, type VolunteerApplicant, type VolunteerProfile } from './volunteers.repository';
import type { ListVolunteersQuery, RegisterInput, ReviewInput, UpdateProfileInput } from './volunteers.schemas';

export type ApplicantWithDocuments = VolunteerApplicant & { documents: DocumentLink[] };

@Injectable()
export class VolunteersService {
  constructor(
    private readonly volunteers: VolunteersRepository,
    private readonly documents: VolunteerDocumentsService,
    private readonly audit: AuditService,
    private readonly events: DomainEventBus,
  ) {}

  async register(input: RegisterInput, user: AuthUser): Promise<VolunteerProfile> {
    const location = { lat: input.lat, lon: input.lon };
    await this.assertServedLocation(location);
    return this.volunteers.register(user.id, { skills: input.skills, serviceRadiusKm: input.serviceRadiusKm, location });
  }

  async mine(user: AuthUser): Promise<VolunteerProfile> {
    const profile = await this.volunteers.findByUser(user.id);
    if (!profile) throw volunteerNotFound();
    return profile;
  }

  async update(input: UpdateProfileInput, user: AuthUser): Promise<VolunteerProfile> {
    const location = input.lat !== undefined && input.lon !== undefined ? { lat: input.lat, lon: input.lon } : undefined;
    if (location) await this.assertServedLocation(location);

    const profile = await this.volunteers.update(user.id, {
      skills: input.skills,
      serviceRadiusKm: input.serviceRadiusKm,
      isAvailable: input.isAvailable,
      location,
    });
    if (!profile) throw volunteerNotFound();
    return profile;
  }

  async listForReview(
    query: ListVolunteersQuery,
    official: AuthUser,
    ipAddress: string | null,
  ): Promise<ApplicantWithDocuments[]> {
    const applicants = await this.volunteers.listInDistrict(requireDistrict(official), query.status, query.limit);
    const documents = await this.documents.linksByVolunteer(applicants.map((applicant) => applicant.userId));
    const withDocuments = applicants.map((applicant) => ({
      ...applicant,
      documents: documents.get(applicant.userId) ?? [],
    }));

    await Promise.all(
      withDocuments.map((applicant) =>
        this.audit.record({
          actorId: official.id,
          action: 'volunteer.documents.viewed',
          entityType: 'volunteer',
          entityId: applicant.userId,
          metadata: { documentIds: applicant.documents.map((document) => document.id) },
          ipAddress,
        }),
      ),
    );
    return withDocuments;
  }

  async review(userId: string, input: ReviewInput, official: AuthUser): Promise<VolunteerProfile> {
    const districtId = requireDistrict(official);
    const reviewed = await this.volunteers.review({
      userId,
      reviewerId: official.id,
      districtId,
      decision: input.decision,
      rejectionReason: input.decision === 'REJECTED' ? (input.rejectionReason ?? null) : null,
    });

    if (!reviewed) {
      const current = await this.volunteers.findInDistrict(userId, districtId);
      if (!current) throw volunteerNotFound();
      // A repeated click or a retried request asks for what already happened, so it gets
      // the current profile; only a conflicting decision is refused.
      if (current.verificationStatus === input.decision) return current;
      throw new ConflictException({
        code: 'VOLUNTEER_ALREADY_REVIEWED',
        message: 'This application has already been reviewed',
      });
    }

    this.events.publish({
      name: 'volunteer:reviewed',
      rooms: [rooms.user(userId)],
      payload: { userId, verificationStatus: reviewed.verificationStatus, rejectionReason: reviewed.rejectionReason },
    });
    return reviewed;
  }

  // Officials only see volunteers located in their district, so a location no district
  // covers would leave the application unreviewable forever.
  private async assertServedLocation(location: LatLon): Promise<void> {
    if ((await this.volunteers.districtsCovering(location)).length === 0) {
      throw locationOutsideDistrict('This location is outside every district NDMS serves');
    }
  }
}
