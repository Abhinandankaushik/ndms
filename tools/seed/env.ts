import { join } from 'node:path';

export const REPO_ROOT = join(import.meta.dirname, '..', '..');

export class UsageError extends Error {}

// Variables already set in the environment win over the file, as with node --env-file.
export function databaseUrl(): string {
  try {
    process.loadEnvFile(join(REPO_ROOT, '.env'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const url = process.env['DATABASE_URL'];
  if (!url) throw new UsageError('DATABASE_URL is not set: copy .env.example to .env or export it');
  return url;
}
