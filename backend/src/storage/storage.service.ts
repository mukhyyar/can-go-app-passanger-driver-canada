import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private bucket: string;
  private ready = false;

  constructor(private readonly config: ConfigService) {
    this.bucket =
      this.config.get<string>('s3.documentsBucket') ?? 'cango-documents';
  }

  async onModuleInit() {
    const endpoint = this.config.get<string>('s3.endpoint');
    const accessKey = this.config.get<string>('s3.accessKey');
    const secretKey = this.config.get<string>('s3.secretKey');
    if (!endpoint || !accessKey || !secretKey) {
      this.logger.warn(
        'S3/MinIO not fully configured; document uploads disabled until env is set.',
      );
      return;
    }

    this.client = new S3Client({
      region: this.config.get<string>('s3.region') ?? 'us-east-1',
      endpoint,
      forcePathStyle: this.config.get<boolean>('s3.forcePathStyle') ?? true,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    try {
      await this.ensureBucket();
      this.ready = true;
      this.logger.log(`Object storage ready bucket=${this.bucket}`);
    } catch (err) {
      this.logger.error(
        'Failed to initialize object storage',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  isReady() {
    return this.ready && this.client !== null;
  }

  private assertClient(): S3Client {
    if (!this.client || !this.ready) {
      throw new ServiceUnavailableException('Object storage is not available');
    }
    return this.client;
  }

  private async ensureBucket() {
    const client = this.client!;
    try {
      await client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created private bucket ${this.bucket}`);
    }
  }

  async putObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }) {
    const client = this.assertClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
    return { bucket: this.bucket, key: params.key };
  }

  async getSignedGetUrl(key: string, expiresInSeconds = 900) {
    const client = this.assertClient();
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }
}
