import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { VolunteerTaskStatus } from '../../common/domain/enums';
import { DomainEventBus, rooms } from '../../common/events/domain-event-bus';
import type { AuthUser } from '../auth/auth-user';
import {
  VolunteerTasksRepository,
  type NearbyTask,
  type VolunteerTask,
} from './volunteer-tasks.repository';
import {
  locationOutsideDistrict,
  requireDistrict,
  taskNotFound,
  volunteerNotVerified,
} from './volunteers.errors';
import { VolunteersRepository, type VolunteerProfile } from './volunteers.repository';
import type { CreateTaskInput, ListTasksQuery } from './volunteers.schemas';

const NEARBY_LIMIT = 20;
const ASSIGNED_LIMIT = 100;

const incidentNotFound = () => new NotFoundException({ code: 'INCIDENT_NOT_FOUND', message: 'Incident not found' });
const facilityNotFound = () => new NotFoundException({ code: 'FACILITY_NOT_FOUND', message: 'Facility not found' });

const invalidTransition = (from: VolunteerTaskStatus, to: VolunteerTaskStatus) =>
  new ConflictException({ code: 'INVALID_TRANSITION', message: `A ${from} task cannot become ${to}` });

const taskTaken = () =>
  new ConflictException({ code: 'TASK_TAKEN', message: 'This task has already been taken or closed' });

const volunteerUnavailable = () =>
  new ConflictException({ code: 'VOLUNTEER_UNAVAILABLE', message: 'Mark yourself available before accepting tasks' });

const canCancel = (task: VolunteerTask, user: AuthUser) =>
  task.createdBy === user.id || (user.role === 'GOVT_OFFICIAL' && user.districtId === task.districtId);

@Injectable()
export class VolunteerTasksService {
  constructor(
    private readonly tasks: VolunteerTasksRepository,
    private readonly volunteers: VolunteersRepository,
    private readonly events: DomainEventBus,
  ) {}

  async create(input: CreateTaskInput, user: AuthUser): Promise<VolunteerTask> {
    const districtId = requireDistrict(user);
    const facilityId = this.facilityFor(input.facilityId, user);
    const location = { lat: input.lat, lon: input.lon };

    if (!(await this.volunteers.districtsCovering(location)).includes(districtId)) {
      throw locationOutsideDistrict('Tasks must be located inside your district');
    }
    if (input.incidentId && (await this.tasks.incidentDistrictId(input.incidentId)) !== districtId) {
      throw incidentNotFound();
    }
    if (facilityId && (await this.tasks.facilityDistrictId(facilityId)) !== districtId) {
      throw facilityNotFound();
    }

    const task = await this.tasks.create({
      districtId,
      createdBy: user.id,
      incidentId: input.incidentId ?? null,
      facilityId,
      title: input.title,
      description: input.description ?? null,
      requiredSkills: input.requiredSkills,
      location,
    });
    this.events.publish({
      name: 'volunteer_task:created',
      rooms: [rooms.role('VOLUNTEER'), rooms.district(districtId)],
      payload: task,
    });
    return task;
  }

  list(query: ListTasksQuery, official: AuthUser): Promise<VolunteerTask[]> {
    return this.tasks.listInDistrict(requireDistrict(official), query.status ?? null, query.limit);
  }

  async nearby(user: AuthUser): Promise<NearbyTask[]> {
    await this.verifiedProfile(user);
    return this.tasks.findNearby(user.id, NEARBY_LIMIT);
  }

  mine(user: AuthUser): Promise<VolunteerTask[]> {
    return this.tasks.listAssignedTo(user.id, ASSIGNED_LIMIT);
  }

  async accept(taskId: string, user: AuthUser): Promise<VolunteerTask> {
    const volunteer = await this.verifiedProfile(user);
    const accepted = await this.tasks.accept(taskId, user.id);
    if (accepted) return this.announceUpdate(accepted);

    const task = await this.tasks.findById(taskId);
    if (!task) throw taskNotFound();
    if (task.status === 'ACCEPTED' && task.assignedVolunteerId === user.id) return task;
    if (task.status !== 'OPEN') throw taskTaken();
    if (!volunteer.isAvailable) throw volunteerUnavailable();
    // Still open but outside this volunteer's radius or skills: not offered to them, so it
    // reads as missing, the same as any other out-of-scope id.
    throw taskNotFound();
  }

  async complete(taskId: string, user: AuthUser): Promise<VolunteerTask> {
    const completed = await this.tasks.complete(taskId, user.id);
    if (completed) return this.announceUpdate(completed);

    const task = await this.tasks.findById(taskId);
    if (!task || task.assignedVolunteerId !== user.id) throw taskNotFound();
    if (task.status === 'COMPLETED') return task;
    throw invalidTransition(task.status, 'COMPLETED');
  }

  async cancel(taskId: string, user: AuthUser): Promise<VolunteerTask> {
    const task = await this.tasks.findById(taskId);
    if (!task || !canCancel(task, user)) throw taskNotFound();

    const cancelled = await this.tasks.cancel(taskId);
    if (cancelled) return this.announceUpdate(cancelled);

    const current = (await this.tasks.findById(taskId))!;
    if (current.status === 'CANCELLED') return current;
    throw invalidTransition(current.status, 'CANCELLED');
  }

  // Facility managers post tasks for their own facility and cannot attach anyone else's.
  private facilityFor(requested: string | undefined, user: AuthUser): string | null {
    if (user.role !== 'FACILITY_MANAGER') return requested ?? null;
    if (requested !== undefined && requested !== user.facilityId) throw facilityNotFound();
    return user.facilityId;
  }

  // Verification is read from the database, not the token: a volunteer's access token
  // still says CITIZEN until their next refresh after an official verifies them.
  private async verifiedProfile(user: AuthUser): Promise<VolunteerProfile> {
    const profile = await this.volunteers.findByUser(user.id);
    if (profile?.verificationStatus !== 'VERIFIED') throw volunteerNotVerified();
    return profile;
  }

  private announceUpdate(task: VolunteerTask): VolunteerTask {
    const recipients = [rooms.district(task.districtId)];
    if (task.assignedVolunteerId) recipients.push(rooms.user(task.assignedVolunteerId));
    this.events.publish({ name: 'volunteer_task:updated', rooms: recipients, payload: task });
    return task;
  }
}
