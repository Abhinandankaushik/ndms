import { Module } from '@nestjs/common';
import { FacilitiesController } from './facilities.controller';
import { FacilitiesRepository } from './facilities.repository';
import { FacilitiesService } from './facilities.service';

@Module({
  controllers: [FacilitiesController],
  providers: [FacilitiesRepository, FacilitiesService],
  exports: [FacilitiesService, FacilitiesRepository],
})
export class FacilitiesModule {}
