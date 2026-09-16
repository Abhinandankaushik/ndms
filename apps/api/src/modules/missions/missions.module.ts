import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module';
import { LivePositionStore } from './live-position.store';
import { MissionsController } from './missions.controller';
import { MissionsRepository } from './missions.repository';
import { MissionsService } from './missions.service';
import { TeamLocationFlusher } from './team-location.flusher';
import { TeamLocationService } from './team-location.service';
import { TeamsController } from './teams.controller';
import { TeamsRepository } from './teams.repository';
import { TeamsService } from './teams.service';

@Module({
  imports: [IncidentsModule],
  controllers: [TeamsController, MissionsController],
  providers: [
    MissionsRepository,
    TeamsRepository,
    LivePositionStore,
    MissionsService,
    TeamsService,
    TeamLocationService,
    TeamLocationFlusher,
  ],
})
export class MissionsModule {}
