import { apiFetch, type CallOptions } from '../client';
import type {
  CreateVolunteerTaskInput,
  NearbyVolunteerTask,
  VolunteerTask,
  VolunteerTaskListQuery,
} from '../types';

const taskAction = (id: string, action: 'accept' | 'complete' | 'cancel') =>
  `/volunteer-tasks/${encodeURIComponent(id)}/${action}`;

export function createVolunteerTask(input: CreateVolunteerTaskInput): Promise<VolunteerTask> {
  return apiFetch<VolunteerTask>('/volunteer-tasks', { method: 'POST', body: input });
}

export function listVolunteerTasks(query: VolunteerTaskListQuery = {}, options?: CallOptions): Promise<VolunteerTask[]> {
  return apiFetch<VolunteerTask[]>('/volunteer-tasks', {
    ...options,
    query: { status: query.status, limit: query.limit },
  });
}

export function listNearbyVolunteerTasks(options?: CallOptions): Promise<NearbyVolunteerTask[]> {
  return apiFetch<NearbyVolunteerTask[]>('/volunteer-tasks/nearby', options);
}

export function listMyVolunteerTasks(options?: CallOptions): Promise<VolunteerTask[]> {
  return apiFetch<VolunteerTask[]>('/volunteer-tasks/mine', options);
}

export function acceptVolunteerTask(id: string): Promise<VolunteerTask> {
  return apiFetch<VolunteerTask>(taskAction(id, 'accept'), { method: 'POST' });
}

export function completeVolunteerTask(id: string): Promise<VolunteerTask> {
  return apiFetch<VolunteerTask>(taskAction(id, 'complete'), { method: 'POST' });
}

export function cancelVolunteerTask(id: string): Promise<VolunteerTask> {
  return apiFetch<VolunteerTask>(taskAction(id, 'cancel'), { method: 'POST' });
}
