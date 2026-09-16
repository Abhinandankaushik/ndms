import { Module } from '@nestjs/common';
import { VolunteerDocumentsRepository } from './volunteer-documents.repository';
import { VolunteerDocumentsService } from './volunteer-documents.service';
import { VolunteerTasksController } from './volunteer-tasks.controller';
import { VolunteerTasksRepository } from './volunteer-tasks.repository';
import { VolunteerTasksService } from './volunteer-tasks.service';
import { VolunteersController } from './volunteers.controller';
import { VolunteersRepository } from './volunteers.repository';
import { VolunteersService } from './volunteers.service';

@Module({
  controllers: [VolunteersController, VolunteerTasksController],
  providers: [
    VolunteersRepository,
    VolunteerDocumentsRepository,
    VolunteerTasksRepository,
    VolunteersService,
    VolunteerDocumentsService,
    VolunteerTasksService,
  ],
})
export class VolunteersModule {}
