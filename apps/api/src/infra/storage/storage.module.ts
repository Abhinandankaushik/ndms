import { S3Client } from '@aws-sdk/client-s3';
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';

export const S3 = Symbol('S3');

function createS3Client(env: Env): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
}

@Global()
@Module({
  providers: [{ provide: S3, inject: [ENV], useFactory: createS3Client }],
  exports: [S3],
})
export class StorageModule implements OnApplicationShutdown {
  constructor(@Inject(S3) private readonly s3: S3Client) {}

  onApplicationShutdown(): void {
    this.s3.destroy();
  }
}
