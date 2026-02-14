import { Test, TestingModule } from '@nestjs/testing';
import { CloudinaryService } from './cloudinary.service';

jest.mock('../config/env.config', () => ({
  validateEnvConfig: jest.fn(() => ({
    CLOUDINARY_CLOUD_NAME: 'test-cloud',
    CLOUDINARY_API_KEY: 'test-key',
    CLOUDINARY_API_SECRET: 'test-secret',
  })),
}));

describe('CloudinaryService', () => {
  let service: CloudinaryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CloudinaryService],
    }).compile();

    service = module.get<CloudinaryService>(CloudinaryService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('uploadImage', () => {
    it('deve ser um método', () => {
      expect(typeof service.uploadImage).toBe('function');
    });
  });

  describe('deleteImage', () => {
    it('deve ser um método', () => {
      expect(typeof service.deleteImage).toBe('function');
    });
  });
});
