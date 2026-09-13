import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module';
import { MediaController } from './media.controller';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';

@Module({
  imports: [IncidentsModule],
  controllers: [MediaController],
  providers: [MediaRepository, MediaService],
})
export class MediaModule {}
