import { defineConfig } from 'prisma/config';

try {
  process.loadEnvFile('../../.env');
} catch {
  // No root .env in CI or Docker builds; the variables come from the environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
