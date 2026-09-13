import { Module } from '@nestjs/common';
import { EnrichmentQueue } from './enrichment.queue';
import { IncidentsController } from './incidents.controller';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsRepository } from './reviews.repository';

@Module({
  controllers: [IncidentsController, ReviewsController],
  providers: [IncidentsRepository, IncidentsService, ReviewsRepository, EnrichmentQueue],
  exports: [IncidentsService, IncidentsRepository, ReviewsRepository],
})
export class IncidentsModule {}
