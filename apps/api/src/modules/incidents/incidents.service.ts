import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { IncidentStatus } from '../../common/domain/enums';
import { rooms, DomainEventBus } from '../../common/events/domain-event-bus';
import type { AuthUser } from '../auth/auth-user';
import { EnrichmentQueue } from './enrichment.queue';
import { assertTransitionAllowed } from './incident-transitions';
import {
  IncidentsRepository,
  type IncidentRecord,
  type MapMarker,
  type NewIncident,
  type StatusLogEntry,
  type UpsertResult,
} from './incidents.repository';
import {
  DEFAULT_MAP_STATUSES,
  type MapQuery,
  type QueueQuery,
  type ReportInput,
  type SosInput,
  type StatusChangeInput,
  type UpdateDetailsInput,
} from './incidents.schemas';

export interface ReportReceipt {
  id: string;
  districtId: number;
  status: IncidentRecord['status'];
  reportedAt: Date;
  wasInserted: boolean;
}

const notFound = () => new NotFoundException({ code: 'INCIDENT_NOT_FOUND', message: 'Incident not found' });

export type MissionDrivenStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'VERIFIED';

const MISSION_TRANSITIONS_FROM: Record<MissionDrivenStatus, readonly IncidentStatus[]> = {
  ASSIGNED: ['REPORTED', 'VERIFIED'],
  IN_PROGRESS: ['ASSIGNED'],
  RESOLVED: ['ASSIGNED', 'IN_PROGRESS'],
  VERIFIED: ['ASSIGNED', 'IN_PROGRESS'],
};

class UnchangedStatus extends Error {}

const isResponder = (user: AuthUser) => user.role === 'GOVT_OFFICIAL' || user.role === 'RESCUE_TEAM';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly incidents: IncidentsRepository,
    private readonly events: DomainEventBus,
    private readonly enrichment: EnrichmentQueue,
  ) {}

  reportSos(input: SosInput, user: AuthUser): Promise<ReportReceipt> {
    return this.record(
      {
        clientUuid: input.clientUuid,
        reporterId: user.id,
        reporterDistrictId: user.districtId,
        type: input.type,
        isSos: true,
        lat: input.lat ?? null,
        lon: input.lon ?? null,
        locationSource: input.lat == null ? 'NONE' : 'GPS',
        accuracyM: input.lat == null ? null : (input.accuracyM ?? null),
        addressText: null,
        description: null,
        peopleAffected: input.peopleAffected,
        hasElderly: false,
        hasChildren: false,
        hasInjured: false,
        reportedAt: new Date(input.reportedAt),
      },
      user,
    );
  }

  reportDetailed(input: ReportInput, user: AuthUser): Promise<ReportReceipt> {
    return this.record(
      {
        clientUuid: input.clientUuid,
        reporterId: user.id,
        reporterDistrictId: user.districtId,
        type: input.type,
        isSos: false,
        lat: input.lat ?? null,
        lon: input.lon ?? null,
        locationSource: input.lat == null ? 'NONE' : input.locationSource,
        accuracyM: input.lat == null || input.locationSource === 'MANUAL_PIN' ? null : (input.accuracyM ?? null),
        addressText: input.addressText ?? null,
        description: input.description ?? null,
        peopleAffected: input.peopleAffected,
        hasElderly: input.hasElderly,
        hasChildren: input.hasChildren,
        hasInjured: input.hasInjured,
        reportedAt: new Date(input.reportedAt),
      },
      user,
    );
  }

  async map(query: MapQuery, user: AuthUser): Promise<MapMarker[]> {
    return this.incidents.findInBoundingBox(
      this.scopedDistrict(user),
      query.bbox,
      query.status ?? DEFAULT_MAP_STATUSES,
      query.type ?? null,
      query.limit,
    );
  }

  async queue(query: QueueQuery, user: AuthUser): Promise<IncidentRecord[]> {
    return this.incidents.findQueue(
      this.scopedDistrict(user),
      query.status ?? DEFAULT_MAP_STATUSES,
      query.type ?? null,
      query.sosOnly ?? false,
      query.limit,
      query.offset,
    );
  }

  mine(user: AuthUser): Promise<IncidentRecord[]> {
    return this.incidents.findByReporter(user.id, 100);
  }

  async detail(id: string, user: AuthUser): Promise<IncidentRecord & { timeline: StatusLogEntry[] }> {
    const incident = await this.incidents.findById(id);
    if (!incident) throw notFound();
    this.assertCanView(incident, user);
    return { ...incident, timeline: await this.incidents.statusLog(id) };
  }

  async findVisible(id: string, user: AuthUser): Promise<IncidentRecord> {
    const incident = await this.incidents.findById(id);
    if (!incident) throw notFound();
    this.assertCanView(incident, user);
    return incident;
  }

  async updateDetails(id: string, input: UpdateDetailsInput, user: AuthUser): Promise<IncidentRecord> {
    const existing = await this.incidents.findById(id);
    if (!existing) throw notFound();
    if (existing.reporterId !== user.id && !(user.role === 'GOVT_OFFICIAL' && user.districtId === existing.districtId)) {
      throw notFound();
    }

    const updated = (await this.incidents.updateDetails(id, input))!;
    this.events.publish({
      name: 'incident:updated',
      rooms: [rooms.district(updated.districtId), rooms.incident(id)],
      payload: updated,
    });
    return updated;
  }

  async changeStatus(id: string, input: StatusChangeInput, user: AuthUser): Promise<IncidentRecord> {
    if (input.duplicateOf === id) {
      throw new BadRequestException({ code: 'DUPLICATE_OF_SELF', message: 'An incident cannot duplicate itself' });
    }

    const result = await this.incidents.changeStatus(
      id,
      (current) => {
        if (!isResponder(user) || user.districtId !== current.districtId) throw notFound();
        assertTransitionAllowed(current.status, input.status, user.role);
      },
      { to: input.status, actorId: user.id, note: input.note ?? null, duplicateOf: input.duplicateOf ?? null },
    );
    if (!result) throw notFound();

    this.events.publish({
      name: 'incident:status_changed',
      rooms: [rooms.district(result.after.districtId), rooms.incident(id), rooms.user(result.after.reporterId)],
      payload: { id, from: result.before.status, to: result.after.status, by: user.id, at: result.after.updatedAt },
    });
    return result.after;
  }

  // Missions move their incident along outside the manual transition table: assignment
  // dispatches it, a team en route makes it in progress, completion resolves it, and
  // withdrawing the last open mission returns it to VERIFIED. Never rejects anything.
  async applyMissionTransition(
    id: string,
    to: MissionDrivenStatus,
    actor: AuthUser,
    note: string,
  ): Promise<IncidentRecord> {
    let result: { before: IncidentRecord; after: IncidentRecord } | null;
    try {
      result = await this.incidents.changeStatus(
        id,
        (current) => {
          if (!MISSION_TRANSITIONS_FROM[to].includes(current.status)) throw new UnchangedStatus();
        },
        { to, actorId: actor.id, note, duplicateOf: null },
      );
    } catch (error) {
      if (!(error instanceof UnchangedStatus)) throw error;
      const current = await this.incidents.findById(id);
      if (!current) throw notFound();
      return current;
    }
    if (!result) throw notFound();

    this.events.publish({
      name: 'incident:status_changed',
      rooms: [rooms.district(result.after.districtId), rooms.incident(id), rooms.user(result.after.reporterId)],
      payload: { id, from: result.before.status, to: result.after.status, by: actor.id, at: result.after.updatedAt },
    });
    return result.after;
  }

  private async record(incident: NewIncident, user: AuthUser): Promise<ReportReceipt> {
    let result: UpsertResult | null;
    try {
      result = await this.incidents.upsert(incident);
    } catch (error) {
      if (String(error).includes('district_id')) {
        throw new ServiceUnavailableException({ code: 'NO_DISTRICT', message: 'No district is configured' });
      }
      throw error;
    }

    if (!result) {
      throw new ConflictException({
        code: 'CLIENT_UUID_CONFLICT',
        message: 'This clientUuid already belongs to another report',
      });
    }

    if (result.wasInserted) {
      this.events.publish({
        name: 'incident:created',
        rooms: [rooms.district(result.districtId)],
        payload: {
          id: result.id,
          districtId: result.districtId,
          reporterId: user.id,
          type: incident.type,
          status: result.status,
          isSos: incident.isSos,
          lat: incident.lat,
          lon: incident.lon,
          accuracyM: incident.accuracyM,
          locationSource: incident.locationSource,
          peopleAffected: incident.peopleAffected,
          hasElderly: incident.hasElderly,
          hasChildren: incident.hasChildren,
          hasInjured: incident.hasInjured,
          priorityScore: null,
          reportedAt: result.reportedAt,
        },
      });
      this.enrichment.enqueue(result.id);
    }

    return {
      id: result.id,
      districtId: result.districtId,
      status: result.status,
      reportedAt: result.reportedAt,
      wasInserted: result.wasInserted,
    };
  }

  private scopedDistrict(user: AuthUser): number {
    if (user.districtId === null) {
      throw new ForbiddenException({ code: 'NO_DISTRICT_SCOPE', message: 'Your account is not assigned to a district' });
    }
    return user.districtId;
  }

  // Unauthorised viewers get 404, not 403, so incident ids cannot be probed.
  private assertCanView(incident: IncidentRecord, user: AuthUser): void {
    if (incident.reporterId === user.id) return;
    if (isResponder(user) && user.districtId === incident.districtId) return;
    throw notFound();
  }
}
