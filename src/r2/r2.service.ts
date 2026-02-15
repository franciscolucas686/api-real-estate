import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { validateEnvConfig } from '../config/env.config';

@Injectable()
export class R2Service {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;

  constructor() {
    const envConfig = validateEnvConfig();

    this.bucketName = envConfig.R2_BUCKET_NAME;
    this.publicBaseUrl = this.normalizeBaseUrl(envConfig.R2_PUBLIC_BASE_URL);

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${envConfig.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: envConfig.R2_ACCESS_KEY_ID,
        secretAccessKey: envConfig.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async uploadImage(buffer: Buffer, key: string, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return `${this.publicBaseUrl}/${key}`;
  }

  async deleteImage(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
  }

  getObjectKeyFromUrl(imageUrl: string): string {
    try {
      const parsedUrl = new URL(imageUrl);
      let key = parsedUrl.pathname.replace(/^\/+/, '');

      if (key.startsWith(`${this.bucketName}/`)) {
        key = key.slice(this.bucketName.length + 1);
      }

      return key;
    } catch {
      return imageUrl;
    }
  }

  private normalizeBaseUrl(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }
}
