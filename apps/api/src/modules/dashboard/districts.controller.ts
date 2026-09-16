import { Controller, Get, NotFoundException } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth-user';
import { DistrictsRepository, type DistrictOverview } from './districts.repository';

@Controller('districts')
export class DistrictsController {
  constructor(private readonly districts: DistrictsRepository) {}

  @Get('mine')
  async mine(@CurrentUser() user: AuthUser): Promise<DistrictOverview> {
    const district = await this.districts.findPreferred(user.districtId);
    if (!district) {
      throw new NotFoundException({ code: 'DISTRICT_NOT_FOUND', message: 'No district is configured' });
    }
    return district;
  }
}
