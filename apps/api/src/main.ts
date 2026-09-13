import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { ENV, type Env } from './config/env';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule));
  const env = app.get<Env>(ENV);

  const ioAdapter = new RedisIoAdapter(app, env);
  await ioAdapter.connectToRedis();
  app.useWebSocketAdapter(ioAdapter);

  app.enableShutdownHooks();
  await app.listen(env.API_PORT);
}

void bootstrap();
