import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWeightedSampler, mulberry32, pickWeighted, randomStream, RNG_SEED, seedUuid } from './random.ts';

// The published mulberry32 (Tommy Ettinger, as popularised by bryc), kept verbatim.
function referenceMulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RFC_9562_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('mulberry32 reproduces the reference sequence for the fixed seed', () => {
  const random = mulberry32(RNG_SEED);
  const reference = referenceMulberry32(RNG_SEED);
  for (let draw = 0; draw < 10_000; draw++) assert.equal(random(), reference());
  assert.deepEqual(
    [0, 1, 2].map(mulberry32(20260913)),
    [0.5173325412906706, 0.5133373069111258, 0.3011599318124354],
  );
});

test('a named stream is reproducible and independent of the others', () => {
  const draws = (name: string) => Array.from({ length: 100 }, randomStream(name));
  assert.deepEqual(draws('incidents'), draws('incidents'));
  assert.notDeepEqual(draws('incidents'), draws('facilities'));
});

test('seed ids are stable RFC 9562 UUIDs, one per key', () => {
  assert.equal(seedUuid('incident:0'), '538522ab-4db8-803b-a44b-fefae70010e4');
  const ids = Array.from({ length: 5_000 }, (_, index) => seedUuid(`incident:${index}`));
  assert.ok(ids.every((id) => RFC_9562_UUID.test(id)));
  assert.equal(new Set(ids).size, ids.length);
});

test('weighted sampling never picks a zero weight and follows the weights', () => {
  const sample = createWeightedSampler([0, 1, 0, 3, 0]);
  const random = mulberry32(1);
  const picks = [0, 0, 0, 0, 0];
  for (let draw = 0; draw < 40_000; draw++) picks[sample(random)]!++;
  assert.equal(picks[0]! + picks[2]! + picks[4]!, 0);
  assert.ok(Math.abs(picks[3]! / picks[1]! - 3) < 0.15, `ratio ${picks[3]! / picks[1]!}`);

  const counts = { a: 0, b: 0 };
  for (let draw = 0; draw < 40_000; draw++) counts[pickWeighted(random, [['a', 0.25], ['b', 0.75]] as const)]++;
  assert.ok(Math.abs(counts.b / counts.a - 3) < 0.15, `ratio ${counts.b / counts.a}`);
});
