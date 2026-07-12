import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { StorageNotConfiguredError } from '../common/errors';
import { ConfigService } from '../config/config.service';

@Injectable()
export class R2Service {
  private readonly client: S3Client | null = null;
  private readonly bucketName: string | null = null;
  private readonly publicBaseUrl: string | null = null;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isConfigured =
      !!configService.r2AccountId &&
      !!configService.r2AccessKeyId &&
      !!configService.r2SecretAccessKey &&
      !!configService.r2BucketName &&
      !!configService.r2PublicBaseUrl;

    if (this.isConfigured) {
      this.bucketName = configService.r2BucketName!;
      this.publicBaseUrl = this.normalizeBaseUrl(configService.r2PublicBaseUrl!);

      const r2Endpoint = configService.r2Endpoint;
      this.client = new S3Client({
        region: 'auto',
        endpoint: r2Endpoint ?? `https://${configService.r2AccountId!}.r2.cloudflarestorage.com`,
        forcePathStyle: !!r2Endpoint,
        credentials: {
          accessKeyId: configService.r2AccessKeyId!,
          secretAccessKey: configService.r2SecretAccessKey!,
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
        CacheControl: 'public, max-age=31536000, immutable',
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

  async deleteImages(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const { client, bucketName } = this.getConfigured();

    const objects = keys.map((key) => ({ Key: key }));

    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: objects },
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

  async moveObject(sourceKey: string, destinationKey: string): Promise<string> {
    const { client, bucketName, publicBaseUrl } = this.getConfigured();

    await client.send(
      new CopyObjectCommand({
        Bucket: bucketName,
        CopySource: `${bucketName}/${sourceKey}`,
        Key: destinationKey,
      }),
    );

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: sourceKey,
      }),
    );

    return `${publicBaseUrl}/${destinationKey}`;
  }

  async listObjectsByPrefix(prefix: string): Promise<string[]> {
    const { client, bucketName } = this.getConfigured();

    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const list = await client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of list.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }

      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
  }

  async deleteObjectsByPrefix(prefix: string): Promise<void> {
    const { client, bucketName } = this.getConfigured();

    let continuationToken: string | undefined;

    do {
      const list = await client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = list.Contents?.map((obj) => ({ Key: obj.Key! })) ?? [];

      if (objects.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: { Objects: objects },
          }),
        );
      }

      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
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
