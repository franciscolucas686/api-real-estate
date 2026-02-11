import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { validateEnvConfig } from '../config/env.config';

@Injectable()
export class CloudinaryService {
  constructor() {
    const envConfig = validateEnvConfig();
    cloudinary.config({
      cloud_name: envConfig.CLOUDINARY_CLOUD_NAME,
      api_key: envConfig.CLOUDINARY_API_KEY,
      api_secret: envConfig.CLOUDINARY_API_SECRET,
    });
  }

  async uploadImage(buffer: Buffer, filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          public_id: filename,
          folder: 'real-estate-properties',
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            resolve(result.secure_url);
          } else {
            reject(new Error('Upload failed without result'));
          }
        },
      );

      stream.end(buffer);
    });
  }

  async deleteImage(publicId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      void cloudinary.uploader.destroy(publicId, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
