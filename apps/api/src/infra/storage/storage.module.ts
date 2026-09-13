import { S3Client } from '@aws-sdk/client-s3';
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';

export const S3 = Symbol('S3');
export const S3_PUBLIC = Symbol('S3_PUBLIC');

const createClient = (env: Env, endpoint: string) =>
  new S3Client({
    endpoint,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    // Browsers cannot add the SDK's default checksum headers to a presigned PUT.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

@Global()
@Module({
  providers: [
    { provide: S3, inject: [ENV], useFactory: (env: Env) => createClient(env, env.S3_ENDPOINT) },
    // Presigned URLs embed the host they were signed for, so they must be signed with the
    // address the browser uses, not the Docker-internal one.
    {
      provide: S3_PUBLIC,
      inject: [ENV],
      useFactory: (env: Env) => createClient(env, env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT),
    },
  ],
  exports: [S3, S3_PUBLIC],
})
export class StorageModule implements OnApplicationShutdown {
  constructor(
    @Inject(S3) private readonly s3: S3Client,
    @Inject(S3_PUBLIC) private readonly s3Public: S3Client,
  ) {}

  onApplicationShutdown(): void {
    this.s3.destroy();
    this.s3Public.destroy();
  }
}
