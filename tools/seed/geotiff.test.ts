import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './env.ts';
import { populationWithin, readPopulationRaster, totalPopulation } from './geotiff.ts';

const RASTER = join(REPO_ROOT, 'data', 'raw', 'worldpop', 'darbhanga_ppp_2020.tif');
const skip = existsSync(RASTER) ? false : `${RASTER} is not present (data/raw is not committed)`;

// The expected figures are what GDAL reports for the same file (tools/data/clip-worldpop.sh).
test('reads the clipped WorldPop raster exactly as GDAL does', { skip }, () => {
  const raster = readPopulationRaster(RASTER);
  assert.equal(raster.width, 879);
  assert.equal(raster.height, 697);
  assert.equal(raster.nodata, -99999);
  assert.ok(Math.abs(raster.originLon - 85.6737496725295813) < 1e-12);
  assert.ok(Math.abs(raster.originLat - 26.4479167618831497) < 1e-12);

  const { people, populatedCells } = totalPopulation(raster);
  assert.equal(Math.round(people), 4_402_776);
  assert.equal((100 * populatedCells / raster.values.length).toFixed(2), '29.37');
  assert.equal((people / populatedCells).toFixed(2), '24.47');
});

test('population within a radius grows with the radius and is zero off the raster', { skip }, () => {
  const raster = readPopulationRaster(RASTER);
  const darbhanga = { lon: 85.899507, lat: 26.156999 };
  const nearby = populationWithin(raster, darbhanga, 1000);
  assert.ok(nearby > 10_000, `${nearby}`);
  assert.ok(populationWithin(raster, darbhanga, 2000) > nearby);
  assert.equal(populationWithin(raster, { lon: 80, lat: 20 }, 1000), 0);
});
