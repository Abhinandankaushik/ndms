import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { DB_ENUMS } from './domain.ts';
import { REPO_ROOT } from './env.ts';

function migrationEnums(): Map<string, string[]> {
  const directory = join(REPO_ROOT, 'infra', 'migrations');
  const enums = new Map<string, string[]>();
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(directory, file), 'utf8');
    for (const [, name, values] of sql.matchAll(/CREATE TYPE (\w+) AS ENUM \(([^)]*)\)/g)) {
      enums.set(name!, [...values!.matchAll(/'([^']*)'/g)].map(([, value]) => value!));
    }
    for (const [, name, value] of sql.matchAll(/ALTER TYPE (\w+) ADD VALUE (?:IF NOT EXISTS )?'([^']*)'/g)) {
      enums.get(name!)?.push(value!);
    }
  }
  return enums;
}

test('the enums the seed writes match infra/migrations', () => {
  const enums = migrationEnums();
  for (const [name, values] of Object.entries(DB_ENUMS)) {
    assert.deepEqual(enums.get(name), [...values], name);
  }
});
