import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { OPEN_INCIDENT_STATUSES } from '../../common/domain/enums';
import { DomainEventBus, rooms } from '../../common/events/domain-event-bus';
import type { AuthUser } from '../auth/auth-user';
import { IncidentsRepository, type IncidentRecord } from '../incidents/incidents.repository';
import { IncidentsService } from '../incidents/incidents.service';
import {
  decideStep,
  INCIDENT_EFFECTS,
  isOpenMission,
  TEAM_EFFECTS,
  type MissionActor,
} from './mission-transitions';
import {
  MissionsRepository,
  type CreateOutcome,
  type MissionRecord,
  type ReporterContact,
  type ScopedMission,
} from './missions.repository';
import type { AssignMissionInput, MissionListQuery, MissionStatusChangeInput } from './missions.schemas';
import { districtScope, findDistrictIncident, teamScope } from './scope';

export interface MissionWithIncident extends MissionRecord {
  incident: IncidentRecord;
}

export interface MissionDetail extends MissionWithIncident {
  reporter: ReporterContact | null;
}

const TEAM_MISSIONS_LIMIT = 50;

const missionNotFound = () => new NotFoundException({ code: 'MISSION_NOT_FOUND', message: 'Mission not found' });

const teamUnavailable = () =>
  new ConflictException({ code: 'TEAM_UNAVAILABLE', message: 'This team is not available for a new mission' });

const ASSIGNMENT_REFUSALS: Record<Exclude<CreateOutcome['kind'], 'CREATED'>, () => Error> = {
  TEAM_NOT_FOUND: () => new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Team not found' }),
  TEAM_UNAVAILABLE: teamUnavailable,
  ALREADY_OPEN: () =>
    new ConflictException({ code: 'MISSION_ALREADY_OPEN', message: 'This team already has an open mission for this incident' }),
};

// Out-of-scope viewers get null and then 404, never 403, so mission ids cannot be probed.
function actorFor(scoped: ScopedMission, user: AuthUser): MissionActor | null {
  if (user.role === 'RESCUE_TEAM' && user.rescueTeamId === scoped.mission.teamId) return 'TEAM';
  if (user.role === 'GOVT_OFFICIAL' && user.districtId === scoped.districtId) return 'OFFICIAL';
  return null;
}

@Injectable()
export class MissionsService {
  constructor(
    private readonly missions: MissionsRepository,
    private readonly incidents: IncidentsService,
    private readonly incidentRecords: IncidentsRepository,
    private readonly events: DomainEventBus,
    private readonly audit: AuditService,
  ) {}

  async assign(input: AssignMissionInput, official: AuthUser): Promise<MissionRecord> {
    const incident = await findDistrictIncident(this.incidentRecords, input.incidentId, official);
    if (!OPEN_INCIDENT_STATUSES.includes(incident.status)) {
      throw new ConflictException({
        code: 'INCIDENT_NOT_OPEN',
        message: `A ${incident.status} incident cannot be assigned; reopen it first`,
      });
    }

    const outcome = await this.missions.create({
      incidentId: incident.id,
      teamId: input.teamId,
      districtId: incident.districtId,
      assignedBy: official.id,
      etaMinutes: input.etaMinutes ?? null,
    });
    if (outcome.kind !== 'CREATED') throw ASSIGNMENT_REFUSALS[outcome.kind]();

    const dispatched = await this.incidents.applyMissionTransition(
      incident.id,
      'ASSIGNED',
      official,
      `Team ${outcome.teamName} assigned`,
    );
    this.events.publish({
      name: 'mission:assigned',
      rooms: [rooms.team(outcome.mission.teamId), rooms.district(dispatched.districtId), rooms.incident(dispatched.id)],
      payload: { mission: outcome.mission, incident: dispatched },
    });
    return outcome.mission;
  }

  list(query: MissionListQuery, official: AuthUser): Promise<MissionRecord[]> {
    return this.missions.listForDistrict({
      districtId: districtScope(official),
      statuses: query.status ?? null,
      incidentId: query.incidentId ?? null,
      limit: query.limit,
    });
  }

  async mine(user: AuthUser): Promise<MissionWithIncident[]> {
    const missions = await this.missions.listForTeam(teamScope(user), TEAM_MISSIONS_LIMIT);
    const incidents = await this.incidentsById(missions.map((mission) => mission.incidentId));
    return missions.map((mission) => ({ ...mission, incident: incidents.get(mission.incidentId)! }));
  }

  async detail(id: string, user: AuthUser, ipAddress: string | null): Promise<MissionDetail> {
    const scoped = await this.missions.findScoped(id);
    const actor = scoped && actorFor(scoped, user);
    if (!scoped || !actor) throw missionNotFound();

    const incident = (await this.incidentRecords.findById(scoped.mission.incidentId))!;
    const reporter =
      actor === 'TEAM' && isOpenMission(scoped.mission.status)
        ? await this.revealReporter(scoped.mission, user, ipAddress)
        : null;
    return { ...scoped.mission, incident, reporter };
  }

  async changeStatus(id: string, input: MissionStatusChangeInput, user: AuthUser): Promise<MissionRecord> {
    const outcome = await this.missions.applyStep(
      id,
      (current) => {
        const actor = actorFor(current, user);
        if (!actor) throw missionNotFound();
        return decideStep(current.mission.status, input.status, actor);
      },
      {
        to: input.status,
        rejectionReason: input.rejectionReason ?? null,
        peopleRescued: input.peopleRescued ?? null,
        injuredCount: input.injuredCount ?? null,
        hospitalRequired: input.hospitalRequired ?? null,
        outcomeNotes: input.outcomeNotes ?? null,
        teamEffect: TEAM_EFFECTS[input.status] ?? null,
      },
    );
    if (!outcome) throw missionNotFound();
    if (outcome.kind === 'TEAM_UNAVAILABLE') throw teamUnavailable();
    if (outcome.kind === 'REPLAYED') return outcome.scoped.mission;

    const { mission, districtId } = outcome.scoped;
    await this.moveIncident(outcome.scoped, user);
    this.events.publish({
      name: 'mission:status_changed',
      rooms: [rooms.team(mission.teamId), rooms.district(districtId), rooms.incident(mission.incidentId)],
      payload: {
        missionId: mission.id,
        incidentId: mission.incidentId,
        teamId: mission.teamId,
        from: outcome.from,
        to: mission.status,
        at: mission.updatedAt,
      },
    });
    return mission;
  }

  // Open missions are counted only after the step has committed. Counted inside it, two teams
  // withdrawing from one incident at the same moment would each still see the other's mission
  // as open, and the incident would stay ASSIGNED with nobody on it.
  private async moveIncident(scoped: ScopedMission, actor: AuthUser): Promise<void> {
    const { mission, teamName } = scoped;
    const effect = INCIDENT_EFFECTS[mission.status];
    if (!effect) return;
    if (effect.onlyWithoutOpenMissions && (await this.missions.countOpenMissions(mission.incidentId)) > 0) return;
    await this.incidents.applyMissionTransition(mission.incidentId, effect.to, actor, effect.note(teamName));
  }

  // The contact is shown only while the team still holds an open mission, and every showing
  // is audited before the data leaves the server.
  private async revealReporter(
    mission: MissionRecord,
    user: AuthUser,
    ipAddress: string | null,
  ): Promise<ReporterContact | null> {
    const contact = await this.missions.findReporterContact(mission.incidentId);
    await this.audit.record({
      actorId: user.id,
      action: 'mission.reporter_contact.viewed',
      entityType: 'incident',
      entityId: mission.incidentId,
      metadata: { missionId: mission.id },
      ipAddress,
    });
    return contact;
  }

  private async incidentsById(ids: string[]): Promise<Map<string, IncidentRecord>> {
    const records = await Promise.all([...new Set(ids)].map((id) => this.incidentRecords.findById(id)));
    return new Map(records.flatMap((record) => (record ? [[record.id, record] as const] : [])));
  }
}
