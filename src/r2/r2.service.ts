import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { StorageNotConfiguredError } from '../common/errors';
import { validateEnvConfig } from '../config/env.config';

@Injectable()
export class R2Service {
  private readonly client: S3Client | null = null;
  private readonly bucketName: string | null = null;
  private readonly publicBaseUrl: string | null = null;
  private readonly isConfigured: boolean;

  constructor() {
    const envConfig = validateEnvConfig();

    this.isConfigured =
      !!envConfig.R2_ACCOUNT_ID &&
      !!envConfig.R2_ACCESS_KEY_ID &&
      !!envConfig.R2_SECRET_ACCESS_KEY &&
      !!envConfig.R2_BUCKET_NAME &&
      !!envConfig.R2_PUBLIC_BASE_URL;

    if (this.isConfigured) {
      this.bucketName = envConfig.R2_BUCKET_NAME!;
      this.publicBaseUrl = this.normalizeBaseUrl(envConfig.R2_PUBLIC_BASE_URL!);

      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${envConfig.R2_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: envConfig.R2_ACCESS_KEY_ID!,
          secretAccessKey: envConfig.R2_SECRET_ACCESS_KEY!,
        },
      });
    }
  }

  async uploadImage(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const { client, bucketName, publicBaseUrl } = this.getConfigured();

    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return `${publicBaseUrl}/${key}`;
  }

  async deleteImage(key: string): Promise<void> {
    const { client, bucketName } = this.getConfigured();

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
  }

  getObjectKeyFromUrl(imageUrl: string): string {
    const { bucketName } = this.getConfigured();

    try {
      const parsedUrl = new URL(imageUrl);
      let key = parsedUrl.pathname.replace(/^\/+/, '');

      if (key.startsWith(`${bucketName}/`)) {
        key = key.slice(bucketName.length + 1);
      }

      return key;
    } catch {
      return imageUrl;
    }
  }

  private normalizeBaseUrl(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }

  private getConfigured(): {
    client: S3Client;
    bucketName: string;
    publicBaseUrl: string;
  } {
    if (!this.isConfigured || !this.client || !this.bucketName || !this.publicBaseUrl) {
      throw new StorageNotConfiguredError();
    }

    return {
      client: this.client,
      bucketName: this.bucketName,
      publicBaseUrl: this.publicBaseUrl,
    };
  }
}
