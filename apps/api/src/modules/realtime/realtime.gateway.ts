import { Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Subscription } from 'rxjs';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { DomainEventBus, rooms } from '../../common/events/domain-event-bus';
import type { AuthUser } from '../auth/auth-user';
import { TokenService } from '../auth/token.service';
import { IncidentsService } from '../incidents/incidents.service';

interface AuthedSocket extends Socket {
  data: { user: AuthUser };
}

const incidentSubscriptionSchema = z.object({ incidentId: z.uuid() });

export function roomsFor(user: AuthUser): string[] {
  const joined = [rooms.user(user.id), rooms.role(user.role)];
  if (user.role === 'GOVT_OFFICIAL' && user.districtId !== null) joined.push(rooms.district(user.districtId));
  if (user.rescueTeamId) joined.push(rooms.team(user.rescueTeamId));
  if (user.facilityId) joined.push(rooms.facility(user.facilityId));
  return joined;
}

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit<Server>, OnGatewayConnection<AuthedSocket>, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  private subscription?: Subscription;

  constructor(
    private readonly tokens: TokenService,
    private readonly events: DomainEventBus,
    private readonly incidents: IncidentsService,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      const token: unknown = socket.handshake.auth?.token;
      if (typeof token !== 'string') {
        next(new Error('AUTH_REQUIRED'));
        return;
      }
      this.tokens.verifyAccessToken(token).then(
        (user) => {
          (socket as AuthedSocket).data.user = user;
          next();
        },
        () => next(new Error('TOKEN_INVALID')),
      );
    });

    this.subscription = this.events.events$.subscribe((event) => {
      if (event.rooms.length > 0) {
        server.to(event.rooms).emit(event.name, event.payload);
      }
    });
    this.logger.log('Realtime gateway ready');
  }

  async handleConnection(socket: AuthedSocket): Promise<void> {
    await socket.join(roomsFor(socket.data.user));
  }

  @SubscribeMessage('incident:subscribe')
  async subscribeToIncident(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: unknown) {
    const parsed = incidentSubscriptionSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'VALIDATION_FAILED' };

    try {
      await this.incidents.findVisible(parsed.data.incidentId, socket.data.user);
    } catch {
      return { ok: false, error: 'INCIDENT_NOT_FOUND' };
    }
    await socket.join(rooms.incident(parsed.data.incidentId));
    return { ok: true };
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
