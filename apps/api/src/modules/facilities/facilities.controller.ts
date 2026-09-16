import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { InventoryItem } from '../../common/domain/enums';
import { uuidParam, zodBody, zodQuery } from '../../common/validation/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth-user';
import {
  createFacilitySchema,
  inventoryChangeSchema,
  inventoryItemParam,
  nearbyQuerySchema,
  occupancyChangeSchema,
  updateFacilitySchema,
  viewportQuerySchema,
  type CreateFacilityInput,
  type InventoryChangeInput,
  type NearbyQuery,
  type OccupancyChangeInput,
  type UpdateFacilityInput,
  type ViewportQuery,
} from './facilities.schemas';
import { FacilitiesService } from './facilities.service';

@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilities: FacilitiesService) {}

  @Get('nearby')
  nearby(@Query(zodQuery(nearbyQuerySchema)) query: NearbyQuery) {
    return this.facilities.nearby(query);
  }

  @Get('mine')
  @Roles('FACILITY_MANAGER')
  mine(@CurrentUser() user: AuthUser) {
    return this.facilities.mine(user);
  }

  @Get()
  @Roles('GOVT_OFFICIAL', 'RESCUE_TEAM')
  inViewport(@Query(zodQuery(viewportQuerySchema)) query: ViewportQuery, @CurrentUser() user: AuthUser) {
    return this.facilities.inViewport(query, user);
  }

  @Get(':id')
  detail(@Param('id', uuidParam) id: string) {
    return this.facilities.detail(id);
  }

  @Post()
  @Roles('GOVT_OFFICIAL')
  create(@Body(zodBody(createFacilitySchema)) body: CreateFacilityInput, @CurrentUser() user: AuthUser) {
    return this.facilities.create(body, user);
  }

  @Patch(':id')
  @Roles('GOVT_OFFICIAL', 'FACILITY_MANAGER')
  update(
    @Param('id', uuidParam) id: string,
    @Body(zodBody(updateFacilitySchema)) body: UpdateFacilityInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.facilities.update(id, body, user);
  }

  @Patch(':id/occupancy')
  @Roles('GOVT_OFFICIAL', 'FACILITY_MANAGER')
  changeOccupancy(
    @Param('id', uuidParam) id: string,
    @Body(zodBody(occupancyChangeSchema)) body: OccupancyChangeInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.facilities.changeOccupancy(id, body.delta, user);
  }

  @Patch(':id/inventory/:item')
  @Roles('GOVT_OFFICIAL', 'FACILITY_MANAGER')
  adjustInventory(
    @Param('id', uuidParam) id: string,
    @Param('item', inventoryItemParam) item: InventoryItem,
    @Body(zodBody(inventoryChangeSchema)) body: InventoryChangeInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.facilities.adjustInventory(id, item, body, user);
  }
}
