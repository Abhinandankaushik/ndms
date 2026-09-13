import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/http/response-envelope.interceptor';

export function configureApp<T extends INestApplication>(app: T): T {
  // Leading slash required: on Nest 12.0.1 + Express 5 a bare 'api/v1' prefix leaves the
  // 404 handler unmounted, so unknown routes return Express's HTML page instead of the envelope.
  app.setGlobalPrefix('/api/v1');
  app.use(cookieParser());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
