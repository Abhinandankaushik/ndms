import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { InventoryItem } from '../../common/domain/enums';
import { DomainEventBus, rooms } from '../../common/events/domain-event-bus';
import type { AuthUser } from '../auth/auth-user';
import { capacityFigures, crossedAlertLevel, type CapacityFigures, type Headcount } from './facility-capacity';
import {
  FacilitiesRepository,
  type Facility,
  type FacilityRef,
  type InventoryLine,
  type NearbyFacility,
} from './facilities.repository';
import type {
  CreateFacilityInput,
  InventoryChangeInput,
  NearbyQuery,
  UpdateFacilityInput,
  ViewportQuery,
} from './facilities.schemas';

export type FacilityDetail = Facility & { inventory: InventoryLine[] };

const facilityNotFound = () => new NotFoundException({ code: 'FACILITY_NOT_FOUND', message: 'Facility not found' });

const facilityRooms = (facility: { id: string; districtId: number }) => [
  rooms.district(facility.districtId),
  rooms.facility(facility.id),
];

const canManage = (facility: Facility, user: AuthUser) =>
  (user.role === 'GOVT_OFFICIAL' && user.districtId === facility.districtId) ||
  (user.role === 'FACILITY_MANAGER' && user.facilityId === facility.id);

function scopedDistrict(user: AuthUser): number {
  if (user.districtId === null) {
    throw new ForbiddenException({ code: 'NO_DISTRICT_SCOPE', message: 'Your account is not assigned to a district' });
  }
  return user.districtId;
}

@Injectable()
export class FacilitiesService {
  constructor(
    private readonly facilities: FacilitiesRepository,
    private readonly events: DomainEventBus,
  ) {}

  nearby(query: NearbyQuery): Promise<NearbyFacility[]> {
    return this.facilities.findNearest({ lat: query.lat, lon: query.lon }, query.kind, query.withSpaceOnly, query.limit);
  }

  async inViewport(query: ViewportQuery, user: AuthUser): Promise<Facility[]> {
    return this.facilities.findInViewport(scopedDistrict(user), query.bbox, query.kind ?? null);
  }

  async mine(user: AuthUser): Promise<FacilityDetail> {
    if (!user.facilityId) throw facilityNotFound();
    return this.detail(user.facilityId);
  }

  async detail(id: string): Promise<FacilityDetail> {
    const [facility, inventory] = await Promise.all([this.facilities.findById(id), this.facilities.inventory(id)]);
    if (!facility) throw facilityNotFound();
    return { ...facility, inventory };
  }

  async create(input: CreateFacilityInput, user: AuthUser): Promise<Facility> {
    const facility = await this.facilities.create({
      ...input,
      districtId: scopedDistrict(user),
      address: input.address ?? null,
      contactPhone: input.contactPhone ?? null,
    });
    if (!facility) {
      throw new UnprocessableEntityException({
        code: 'OUTSIDE_DISTRICT',
        message: 'The facility location is outside your district',
      });
    }
    return facility;
  }

  async update(id: string, input: UpdateFacilityInput, user: AuthUser): Promise<Facility> {
    await this.findManageable(id, user);
    const result = await this.facilities.updateDetails(id, input);
    if (result.outcome === 'NOT_FOUND') throw facilityNotFound();
    if (result.outcome === 'CAPACITY_BELOW_OCCUPANCY') {
      throw new ConflictException({
        code: 'CAPACITY_BELOW_OCCUPANCY',
        message: `Capacity cannot be lower than the current occupancy of ${result.occupancy}`,
        details: { occupancy: result.occupancy },
      });
    }

    if (result.facility.capacity !== result.before.capacity) {
      this.publishCapacityChange(result.facility, result.before, result.facility);
    }
    return result.facility;
  }

  async changeOccupancy(id: string, delta: number, user: AuthUser): Promise<CapacityFigures> {
    await this.findManageable(id, user);
    const change = await this.facilities.changeOccupancy(id, delta);
    if (!change) throw facilityNotFound();

    this.publishCapacityChange(change.facility, change.before, change.after);
    return capacityFigures(change.after);
  }

  async adjustInventory(
    id: string,
    item: InventoryItem,
    input: InventoryChangeInput,
    user: AuthUser,
  ): Promise<InventoryLine> {
    const facility = await this.findManageable(id, user);
    const line = await this.facilities.adjustInventory(id, item, {
      delta: input.delta ?? 0,
      lowStockThreshold: input.lowStockThreshold,
    });

    this.events.publish({
      name: 'facility:inventory_changed',
      rooms: facilityRooms(facility),
      payload: {
        facilityId: id,
        item: line.item,
        quantity: line.quantity,
        lowStockThreshold: line.lowStockThreshold,
        isLow: line.isLow,
      },
    });
    return line;
  }

  // Out-of-scope facilities answer 404 rather than 403, like every district-scoped route.
  private async findManageable(id: string, user: AuthUser): Promise<Facility> {
    const facility = await this.facilities.findById(id);
    if (!facility || !canManage(facility, user)) throw facilityNotFound();
    return facility;
  }

  private publishCapacityChange(facility: FacilityRef, before: Headcount, after: Headcount): void {
    const { occupancy, capacity, utilisation } = capacityFigures(after);
    const targets = facilityRooms(facility);

    this.events.publish({
      name: 'facility:capacity_changed',
      rooms: targets,
      payload: { facilityId: facility.id, occupancy, capacity, utilisation },
    });
    if (crossedAlertLevel(before, after)) {
      this.events.publish({
        name: 'facility:capacity_alert',
        rooms: targets,
        payload: { facilityId: facility.id, name: facility.name, occupancy, capacity, utilisation },
      });
    }
  }
}
