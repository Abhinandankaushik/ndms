import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { USER_ROLES, type UserRole } from '../../common/domain/enums';
import { DomainEventBus, rooms } from '../../common/events/domain-event-bus';
import type { AuthUser } from '../auth/auth-user';
import { AlertsRepository, type AlertRecord } from './alerts.repository';
import type { ActiveAlertsQuery, IssueAlertInput } from './alerts.schemas';

const HISTORY_LIMIT = 200;
const ACTIVE_LIMIT = 100;

const alertNotFound = () => new NotFoundException({ code: 'ALERT_NOT_FOUND', message: 'Alert not found' });

// Alerts travel by role room because citizens and volunteers belong to no district room.
const audienceRooms = (targetRoles: readonly UserRole[]) =>
  (targetRoles.length > 0 ? targetRoles : USER_ROLES).map((role) => rooms.role(role));

const scopedDistrict = (user: AuthUser): number => {
  if (user.districtId === null) {
    throw new ForbiddenException({ code: 'NO_DISTRICT_SCOPE', message: 'Your account is not assigned to a district' });
  }
  return user.districtId;
};

@Injectable()
export class AlertsService {
  constructor(
    private readonly alerts: AlertsRepository,
    private readonly events: DomainEventBus,
    private readonly audit: AuditService,
  ) {}

  async issue(input: IssueAlertInput, user: AuthUser): Promise<AlertRecord> {
    const districtId = scopedDistrict(user);
    const geofenceGeoJson = input.geofence ? JSON.stringify(input.geofence) : null;
    if (geofenceGeoJson) await this.assertGeofenceUsable(geofenceGeoJson, districtId);

    const alert = await this.alerts.insert({
      districtId,
      createdBy: user.id,
      severity: input.severity,
      title: input.title,
      message: input.message,
      targetRoles: input.targetRoles,
      geofenceGeoJson,
      expiresAt: input.expiresAt ?? null,
    });
    if (!alert) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: { formErrors: [], fieldErrors: { expiresAt: ['expiresAt must be in the future'] } },
      });
    }

    this.events.publish({
      name: 'alert:broadcast',
      rooms: audienceRooms(alert.targetRoles),
      payload: {
        id: alert.id,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        geofence: alert.geofence,
        issuedAt: alert.issuedAt,
        expiresAt: alert.expiresAt,
      },
    });
    return alert;
  }

  history(user: AuthUser): Promise<AlertRecord[]> {
    return this.alerts.findByDistrict(scopedDistrict(user), HISTORY_LIMIT);
  }

  active(query: ActiveAlertsQuery, user: AuthUser): Promise<AlertRecord[]> {
    const position = query.lat === undefined || query.lon === undefined ? null : { lat: query.lat, lon: query.lon };
    return this.alerts.findActive(user.role, position, ACTIVE_LIMIT);
  }

  async cancel(id: string, user: AuthUser): Promise<AlertRecord> {
    const districtId = scopedDistrict(user);
    const cancelled = await this.alerts.cancel(id, districtId);
    if (!cancelled) {
      const existing = await this.alerts.findInDistrict(id, districtId);
      if (!existing) throw alertNotFound();
      return existing;
    }

    // The alerts table records who issued an alert but not who withdrew it.
    await this.audit.record({ actorId: user.id, action: 'alert.status.cancelled', entityType: 'alert', entityId: id });
    this.events.publish({ name: 'alert:cancelled', rooms: audienceRooms(cancelled.targetRoles), payload: { id } });
    return cancelled;
  }

  private async assertGeofenceUsable(geojson: string, districtId: number): Promise<void> {
    const inspection = await this.alerts.inspectGeofence(geojson, districtId);
    if (!inspection.isValid) {
      throw new UnprocessableEntityException({
        code: 'GEOFENCE_INVALID',
        message: 'The geofence is not a valid polygon',
        details: { reason: inspection.invalidReason },
      });
    }
    if (!inspection.intersectsDistrict) {
      throw new UnprocessableEntityException({
        code: 'GEOFENCE_OUTSIDE_DISTRICT',
        message: 'The geofence does not overlap your district',
      });
    }
  }
}
