import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: z.flattenError(result.error),
      });
    }
    return result.data;
  }
}

export const zodBody = <T extends z.ZodType>(schema: T) => new ZodValidationPipe(schema);

export const zodQuery = zodBody;

export const uuidParam = new ZodValidationPipe(z.uuid());
