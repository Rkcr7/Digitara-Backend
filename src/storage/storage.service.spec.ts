import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { StorageService } from './storage.service';
import { promises as fs } from 'fs';

describe('StorageService', () => {
  let service: StorageService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        'upload.uploadDir': 'test-uploads',
        'upload.maxFileSize': 10485760,
        'upload.allowedMimeTypes': ['image/jpeg', 'image/jpg', 'image/png'],
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rmdir('test-uploads', { recursive: true });
    } catch (error) {
      // Ignore if directory doesn't exist
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateFile', () => {
    it('should validate a correct file', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 1000000, // 1MB
        destination: '',
        filename: '',
        path: '',
        buffer: Buffer.from('test'),
        stream: null,
      };

      expect(() => service['validateFile'](mockFile)).not.toThrow();
    });

    it('should throw error for oversized file', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 20000000, // 20MB - exceeds 10MB limit
        destination: '',
        filename: '',
        path: '',
        buffer: Buffer.from('test'),
        stream: null,
      };

      expect(() => service['validateFile'](mockFile)).toThrow(
        BadRequestException,
      );
    });

    it('should throw error for invalid file type', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 1000,
        destination: '',
        filename: '',
        path: '',
        buffer: Buffer.from('test'),
        stream: null,
      };

      expect(() => service['validateFile'](mockFile)).toThrow(
        BadRequestException,
      );
    });

    it('should throw error for missing file', async () => {
      expect(() => service['validateFile'](null)).toThrow(BadRequestException);
    });
  });

  describe('getFileExtension', () => {
    it('should extract file extension correctly', () => {
      expect(service['getFileExtension']('test.jpg')).toBe('.jpg');
      expect(service['getFileExtension']('image.png')).toBe('.png');
      expect(service['getFileExtension']('document.jpeg')).toBe('.jpeg');
    });

    it('should return default extension for files without extension', () => {
      expect(service['getFileExtension']('filename')).toBe('.jpg');
    });
  });

  describe('getFilePath', () => {
    it('should return correct file path', () => {
      const fileName = 'test.jpg';
      const expectedPath = expect.stringContaining('test-uploads');
      expect(service.getFilePath(fileName)).toEqual(
        expect.stringContaining(fileName),
      );
    });
  });
});
