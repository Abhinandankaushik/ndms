// Loads the demo dataset: real Darbhanga geography from data/seed plus deterministic synthetic
// operations (data/SOURCES.md). Usage, from the repo root with Node 24:
//   node tools/seed.ts [--reset] [--incidents N]
import { parseArgs } from 'node:util';
import pg from 'pg';
import { buildSeedDataset, type SeedDataset } from './seed/dataset.ts';
import {
  domainTables,
  incidentFingerprint,
  populatedTables,
  rowCounts,
  truncateTables,
  writeDataset,
  type IncidentFingerprint,
} from './seed/database.ts';
import { databaseUrl, REPO_ROOT, UsageError } from './seed/env.ts';
import { MIN_INCIDENTS } from './seed/incidents.ts';
import { loadSeedInputs, type SeedInputs } from './seed/inputs.ts';
import { RNG_SEED } from './seed/random.ts';

const MAX_INCIDENTS = 200_000;

interface SeedOptions {
  reset: boolean;
  incidentCount: number;
}

function parseOptions(): SeedOptions {
  const { values } = parseArgs({
    options: {
      reset: { type: 'boolean', default: false },
      incidents: { type: 'string', default: '1000' },
    },
  });
  const incidentCount = Number(values.incidents);
  if (!Number.isInteger(incidentCount) || incidentCount < MIN_INCIDENTS || incidentCount > MAX_INCIDENTS) {
    throw new UsageError(`--incidents must be an integer from ${MIN_INCIDENTS} to ${MAX_INCIDENTS}`);
  }
  return { reset: values.reset, incidentCount };
}

function describeInputs(inputs: SeedInputs, dataset: SeedDataset): void {
  console.log(`inputs: ${inputs.places.length} OSM places, ${inputs.facilities.length} OSM facilities, ${inputs.waterways.length} OSM waterways`);
  for (const place of dataset.mergedPlaces) {
    console.log(`  merged double-mapped place ${place.name} (${place.osmId})`);
  }
  if (dataset.district.population === null) {
    console.warn(`  ${inputs.rasterPath} is missing: village populations are NULL and every place weighs 1 (docker compose run --rm gdal sh tools/data/clip-worldpop.sh)`);
  } else {
    console.log(`  WorldPop 2020 raster: ${dataset.district.population.toLocaleString('en-US')} people in the district`);
  }
  for (const team of dataset.teams) {
    console.log(`  team ${team.name}: ${team.baseRule}`);
  }
}

function describeResult(counts: ReadonlyMap<string, number>, fingerprint: IncidentFingerprint, dataset: SeedDataset): void {
  console.log('rows:');
  for (const [table, rows] of counts) console.log(`  ${table.padEnd(22)} ${String(rows).padStart(6)}`);
  console.log(`incident fingerprint (types, coordinates, reported_at offsets): ${fingerprint.fingerprint} over ${fingerprint.incidents} incidents`);
  console.log('demo accounts (log in with OTP_DEV_CODE from .env):');
  for (const user of dataset.demoAccounts) {
    console.log(`  ${user.phone}  ${user.role.padEnd(16)} ${user.assignment}`);
  }
}

async function seed(): Promise<void> {
  const options = parseOptions();
  const client = new pg.Client({ connectionString: databaseUrl() });

  const inputs = loadSeedInputs(REPO_ROOT);
  const dataset = buildSeedDataset(inputs, { incidentCount: options.incidentCount, anchorMs: Date.now() });
  console.log(`NDMS seed: ${inputs.district.name}, ${inputs.district.state}; RNG seed ${RNG_SEED}; ${options.incidentCount} incidents`);
  describeInputs(inputs, dataset);

  await client.connect();
  try {
    await client.query('BEGIN');
    // A running API or worker holding locks would otherwise make TRUNCATE wait silently.
    await client.query(`SET LOCAL lock_timeout = '10s'`);
    const tables = await domainTables(client);
    if (options.reset) {
      await truncateTables(client, tables);
      console.log(`reset: truncated ${tables.length} tables (kept schema_migrations and spatial_ref_sys)`);
    } else {
      const populated = await populatedTables(client, tables);
      if (populated.length > 0) {
        throw new UsageError(`The database already holds data in ${populated.join(', ')}: run with --reset to replace it`);
      }
    }
    await writeDataset(client, dataset);
    await client.query('COMMIT');
    describeResult(await rowCounts(client, tables), await incidentFingerprint(client), dataset);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

try {
  await seed();
} catch (error) {
  console.error(error instanceof UsageError ? error.message : error);
  process.exitCode = 1;
}
