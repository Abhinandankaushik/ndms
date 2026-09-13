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
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    }

    const body = failure(toApiError(exception, status));
    if (host.getType() === 'http') {
      host.switchToHttp().getResponse<Response>().status(status).json(body);
      return;
    }
    host.switchToWs().getClient<{ emit: (event: string, payload: unknown) => void }>().emit('exception', body);
  }
}

function toApiError(exception: unknown, status: number): ApiError {
  const defaultCode = HttpStatus[status] ?? 'ERROR';

  if (!(exception instanceof HttpException)) {
    return { code: defaultCode, message: 'Internal server error' };
  }

  const body = exception.getResponse();
  if (typeof body === 'string') {
    return { code: defaultCode, message: body };
  }

  const { message, details, code } = body as { message?: unknown; details?: unknown; code?: unknown };
  return {
    code: typeof code === 'string' ? code : defaultCode,
    message: Array.isArray(message) ? message.join('; ') : typeof message === 'string' ? message : exception.message,
    ...(details === undefined ? {} : { details }),
  };
}
