export interface WorkerConfig {
  databaseUrl: string;
  redisUrl: string;
}

export function loadConfig(env: Record<string, string | undefined>): WorkerConfig {
  const problems: string[] = [];
  const databaseUrl = readUrl(env, 'DATABASE_URL', ['postgres:', 'postgresql:'], problems);
  const redisUrl = readUrl(env, 'REDIS_URL', ['redis:', 'rediss:'], problems);

  if (databaseUrl === null || redisUrl === null) {
    throw new Error(`Invalid environment configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  }
  return { databaseUrl, redisUrl };
}

// Problems name the variable but never echo its value: these URLs carry passwords.
function readUrl(
  env: Record<string, string | undefined>,
  name: string,
  protocols: readonly string[],
  problems: string[],
): string | null {
  const value = env[name]?.trim();
  if (!value) {
    problems.push(`${name} is required`);
    return null;
  }

  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    problems.push(`${name} is not a valid URL`);
    return null;
  }

  if (!protocols.includes(protocol)) {
    problems.push(`${name} must use ${protocols.map((allowed) => `${allowed}//`).join(' or ')}`);
    return null;
  }
  return value;
}
