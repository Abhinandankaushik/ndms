import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { failure, type ApiError } from './api-envelope';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    }

    response.status(status).json(failure(toApiError(exception, status)));
  }
}

function toApiError(exception: unknown, status: number): ApiError {
  const code = HttpStatus[status] ?? 'ERROR';

  if (!(exception instanceof HttpException)) {
    return { code, message: 'Internal server error' };
  }

  const body = exception.getResponse();
  if (typeof body === 'string') {
    return { code, message: body };
  }

  const { message, details } = body as { message?: unknown; details?: unknown };
  return {
    code,
    message: Array.isArray(message) ? message.join('; ') : typeof message === 'string' ? message : exception.message,
    ...(details === undefined ? {} : { details }),
  };
}
