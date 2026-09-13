import { Injectable } from '@nestjs/common';
import { Subject, type Observable } from 'rxjs';

export interface DomainEvent {
  name: string;
  rooms: string[];
  payload: unknown;
}

export const rooms = {
  district: (districtId: number) => `district:${districtId}`,
  team: (teamId: string) => `team:${teamId}`,
  facility: (facilityId: string) => `facility:${facilityId}`,
  incident: (incidentId: string) => `incident:${incidentId}`,
  user: (userId: string) => `user:${userId}`,
  role: (role: string) => `role:${role}`,
};

@Injectable()
export class DomainEventBus {
  private readonly subject = new Subject<DomainEvent>();

  readonly events$: Observable<DomainEvent> = this.subject.asObservable();

  publish(event: DomainEvent): void {
    this.subject.next(event);
  }
}
