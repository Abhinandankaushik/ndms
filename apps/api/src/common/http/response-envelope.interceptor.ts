import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { envelopeOf } from './api-envelope';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Socket acks keep their own shape; the envelope is an HTTP convention.
    if (context.getType() !== 'http') return next.handle();
    return next.handle().pipe(map(envelopeOf));
  }
}
