import { createHash } from 'node:crypto';

export const RNG_SEED = 20260913;

export type Random = () => number;

// mulberry32 uses only 32-bit integer arithmetic, so the sequence is identical on every
// platform and Node version.
export function mulberry32(seed: number): Random {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each part of the dataset draws from its own stream, so changing how many numbers one part
// consumes (a new inventory rule, say) leaves every other part exactly as it was.
export function randomStream(name: string): Random {
  return mulberry32(createHash('sha256').update(`${RNG_SEED}:${name}`).digest().readUInt32LE(0));
}

export const between = (random: Random, min: number, max: number): number => min + random() * (max - min);

export const integerBetween = (random: Random, min: number, max: number): number =>
  Math.min(max, Math.floor(between(random, min, max + 1)));

export const chance = (random: Random, probability: number): boolean => random() < probability;

export function pickOne<T>(random: Random, items: readonly T[]): T {
  if (items.length === 0) throw new Error('Cannot pick from an empty list');
  return items[Math.floor(random() * items.length)]!;
}

export function pickDistinct<T>(random: Random, items: readonly T[], count: number): T[] {
  const pool = [...items];
  return Array.from({ length: Math.min(count, pool.length) }, () => pool.splice(Math.floor(random() * pool.length), 1)[0]!);
}

export function pickWeighted<T>(random: Random, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let remaining = random() * total;
  for (const [value, weight] of entries) {
    remaining -= weight;
    if (remaining < 0) return value;
  }
  return entries.findLast(([, weight]) => weight > 0)![0];
}

export function createWeightedSampler(weights: readonly number[]): (random: Random) => number {
  const cumulative: number[] = [];
  let total = 0;
  for (const weight of weights) {
    total += weight;
    cumulative.push(total);
  }
  if (!(total > 0)) throw new Error('Weighted sampling needs at least one positive weight');

  return (random) => {
    const target = random() * total;
    let low = 0;
    let high = cumulative.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (cumulative[middle]! > target) high = middle;
      else low = middle + 1;
    }
    return low;
  };
}

// Ids come from a hash of what the row is, not from the random stream, so the same OSM
// feature or incident number keeps its id across re-seeds and demo links stay valid. The
// version nibble is 8, RFC 9562's custom UUID, which z.uuid() in the API accepts.
export function seedUuid(key: string): string {
  const bytes = createHash('sha256').update(`ndms-seed:${RNG_SEED}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
