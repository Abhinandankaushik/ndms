import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DistrictsController } from './districts.controller';
import { DistrictsRepository } from './districts.repository';

@Module({
  controllers: [DashboardController, DistrictsController],
  providers: [DashboardRepository, DistrictsRepository],
})
export class DashboardModule {}
