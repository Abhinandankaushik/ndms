import { apiFetch, type CallOptions } from '../client';
import type { DistrictInfo } from '../types';

export function getMyDistrict(options?: CallOptions): Promise<DistrictInfo> {
  return apiFetch<DistrictInfo>('/districts/mine', options);
}
