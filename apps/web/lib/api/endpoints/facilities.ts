import { apiFetch, type CallOptions } from '../client';
import type {
  CreateFacilityInput,
  Facility,
  FacilityDetail,
  FacilityListQuery,
  FacilityPatch,
  InventoryItem,
  InventoryLine,
  InventoryPatch,
  NearbyFacilitiesQuery,
  NearbyFacility,
  OccupancySnapshot,
} from '../types';

const facilityPath = (id: string) => `/facilities/${encodeURIComponent(id)}`;

export function findNearbyFacilities(query: NearbyFacilitiesQuery, options?: CallOptions): Promise<NearbyFacility[]> {
  return apiFetch<NearbyFacility[]>('/facilities/nearby', {
    ...options,
    query: {
      lat: query.lat,
      lon: query.lon,
      kind: query.kind,
      withSpaceOnly: query.withSpaceOnly,
      limit: query.limit,
    },
  });
}

export function listFacilities(query: FacilityListQuery, options?: CallOptions): Promise<Facility[]> {
  return apiFetch<Facility[]>('/facilities', { ...options, query: { bbox: query.bbox, kind: query.kind } });
}

export function getMyFacility(options?: CallOptions): Promise<FacilityDetail> {
  return apiFetch<FacilityDetail>('/facilities/mine', options);
}

export function getFacility(id: string, options?: CallOptions): Promise<FacilityDetail> {
  return apiFetch<FacilityDetail>(facilityPath(id), options);
}

export function createFacility(input: CreateFacilityInput): Promise<Facility> {
  return apiFetch<Facility>('/facilities', { method: 'POST', body: input });
}

export function updateFacility(id: string, patch: FacilityPatch): Promise<Facility> {
  return apiFetch<Facility>(facilityPath(id), { method: 'PATCH', body: patch });
}

// Occupancy only ever moves by a delta; sending absolute values loses concurrent updates (CLAUDE.md rule 4).
export function adjustOccupancy(id: string, delta: number): Promise<OccupancySnapshot> {
  return apiFetch<OccupancySnapshot>(`${facilityPath(id)}/occupancy`, { method: 'PATCH', body: { delta } });
}

export function adjustInventory(id: string, item: InventoryItem, patch: InventoryPatch): Promise<InventoryLine> {
  return apiFetch<InventoryLine>(`${facilityPath(id)}/inventory/${encodeURIComponent(item)}`, {
    method: 'PATCH',
    body: patch,
  });
}
