import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Client } from 'pg';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/migrations');

export async function applyMigrations(db: Client): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const source = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.query('BEGIN');
    try {
      await db.query(upSection(file, source));
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
}

function upSection(file: string, source: string): string {
  const [up] = source.split('-- migrate:down');
  if (!up?.includes('-- migrate:up')) {
    throw new Error(`${file} has no "-- migrate:up" section`);
  }
  return up;
}
