import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOSPITAL_BEDS, planFacilities, planInventory, PER_PERSON_STOCK, shelterCapacity, withoutDoubleMapping } from './facilities.ts';
import { offsetBy } from './geo.ts';
import type { Amenity, OsmFacility } from './inputs.ts';
import { mulberry32 } from './random.ts';

const DARBHANGA = { lon: 85.899507, lat: 26.156999 };

const facility = (amenity: Amenity, name: string | null, iscedLevel: string | null = null, osmId = `node/${name}`): OsmFacility => ({
  osmId,
  name,
  amenity,
  iscedLevel,
  location: DARBHANGA,
});

test('shelter capacity follows plan §B5 by amenity and school level', () => {
  const cases: [OsmFacility, number, string][] = [
    [facility('school', 'Grameen Public School', '0;1;2'), 150, 'primary school'],
    [facility('school', 'Madhya Vidyalaya', null), 150, 'primary school'],
    [facility('school', 'Govt Primary School Motipur', null), 150, 'primary school'],
    [facility('school', 'Adarsh School', '1;2;3'), 400, 'secondary school'],
    [facility('school', 'Govt. High School Benipur', null), 400, 'secondary school'],
    [facility('school', 'उच्च विद्यालय', null), 400, 'secondary school'],
    [facility('school', '+2 School Jale', null), 400, 'secondary school'],
    [facility('school', 'Holy Cross School', null), 150, 'school of unknown level'],
    [facility('school', null, null), 150, 'school of unknown level'],
    [facility('college', 'Marwari College', '6;7'), 400, 'college'],
    [facility('community_centre', 'Panchayat Bhawan', null), 200, 'community centre'],
  ];
  for (const [input, capacity, rule] of cases) {
    assert.deepEqual(shelterCapacity(input), { capacity, rule }, input.name ?? 'unnamed school');
  }
});

test('hospitals and clinics get synthetic beds, and colleges named as hospitals are hospitals', () => {
  const planned = planFacilities(mulberry32(7), [
    facility('hospital', 'Referral Hospital Jalley'),
    facility('clinic', 'Health and Wellness Centre'),
    facility('college', 'Darbhanga Medical College and Hospital', '6'),
    facility('college', 'Marwari College'),
    facility('police', 'Nehra Police Station'),
  ]);
  assert.deepEqual(
    planned.map(({ name, kind, capacity }) => [name, kind, capacity]),
    [
      ['Referral Hospital Jalley', 'HOSPITAL', HOSPITAL_BEDS.hospital],
      ['Health and Wellness Centre', 'HOSPITAL', HOSPITAL_BEDS.clinic],
      ['Darbhanga Medical College and Hospital', 'HOSPITAL', HOSPITAL_BEDS.hospital],
      ['Marwari College', 'SHELTER', 400],
    ],
  );
  for (const seeded of planned) {
    assert.ok(seeded.occupancy >= 0 && seeded.occupancy <= seeded.capacity);
    assert.equal(seeded.attributes['capacitySource'], 'synthetic');
  }
});

test('one facility mapped twice is merged, distinct facilities are kept', () => {
  const school = facility('school', 'Govt School', null, 'node/1');
  const kept = withoutDoubleMapping([
    school,
    { ...school, osmId: 'node/2', location: offsetBy(DARBHANGA, 0, 30) },
    { ...school, osmId: 'node/3', location: offsetBy(DARBHANGA, 0, 60) },
    { ...school, osmId: 'node/4', name: 'Govt School No. 2' },
    { ...school, osmId: 'node/5', amenity: 'college' },
  ]);
  assert.deepEqual(
    kept.map((entry) => entry.osmId),
    ['node/1', 'node/3', 'node/4', 'node/5'],
  );
});

test('inventory holds every item, sized by capacity with a low-stock threshold at half the need', () => {
  const [shelter] = planFacilities(mulberry32(3), [facility('school', 'Adarsh School', '1;2;3')]);
  const lines = planInventory(mulberry32(3), [shelter!]);
  assert.deepEqual(
    lines.map((line) => line.item),
    Object.keys(PER_PERSON_STOCK),
  );
  for (const line of lines) {
    const need = PER_PERSON_STOCK[line.item] * shelter!.capacity;
    assert.ok(line.quantity >= Math.round(need * 0.25) && line.quantity <= Math.round(need * 1.5), line.item);
    assert.equal(line.lowStockThreshold, Math.max(1, Math.round(need / 2)));
  }
});
