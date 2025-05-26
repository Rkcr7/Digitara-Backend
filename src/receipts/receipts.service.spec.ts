import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';

describe('ReceiptsService', () => {
  let service: ReceiptsService;
  let aiService: AiService;
  let storageService: StorageService;

  const mockAiService = {
    extractReceiptData: jest.fn(),
  };

  const mockStorageService = {
    saveImage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptsService,
        {
          provide: AiService,
          useValue: mockAiService,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
      ],
    }).compile();

    service = module.get<ReceiptsService>(ReceiptsService);
    aiService = module.get<AiService>(AiService);
    storageService = module.get<StorageService>(StorageService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractReceiptData', () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'receipt.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 1000000, // 1MB
      buffer: Buffer.from('test-image-data'),
      destination: '',
      filename: '',
      path: '',
      stream: null,
    };

    const mockAiResponse = {
      date: '2023-09-09',
      currency: 'USD',
      vendor_name: 'Test Store',
      receipt_items: [
        {
          item_name: 'Test Item',
          item_cost: 10.0,
          quantity: 1,
        },
      ],
      subtotal: 10.0,
      tax: 1.0,
      total: 11.0,
      confidence_score: 0.95,
      extraction_metadata: {
        processing_time: 1500,
        ai_model: 'gemini-2.0-flash',
        warnings: [],
      },
    };

    it('should extract receipt data successfully', async () => {
      mockStorageService.saveImage.mockResolvedValue('test-123.jpg');
      mockAiService.extractReceiptData.mockResolvedValue(mockAiResponse);

      const result = await service.extractReceiptData(mockFile, {
        customId: 'test-123',
        saveImage: true,
        includeMetadata: true,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.extraction_id).toBe('test-123');
      expect(result.vendor_name).toBe('Test Store');
      expect(result.total).toBe(11.0);
      expect(result.image_url).toBe('/storage/images/test-123.jpg');
      expect(result.extraction_metadata).toBeDefined();
      expect(mockStorageService.saveImage).toHaveBeenCalledWith(
        mockFile,
        'test-123',
      );
      expect(mockAiService.extractReceiptData).toHaveBeenCalledWith(
        mockFile.buffer,
      );
    });

    it('should generate UUID when customId is not provided', async () => {
      mockStorageService.saveImage.mockResolvedValue('generated-uuid.jpg');
      mockAiService.extractReceiptData.mockResolvedValue(mockAiResponse);

      const result = await service.extractReceiptData(mockFile, {});

      expect(result.extraction_id).toBeDefined();
      expect(result.extraction_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should continue extraction even if image saving fails', async () => {
      mockStorageService.saveImage.mockRejectedValue(
        new Error('Storage error'),
      );
      mockAiService.extractReceiptData.mockResolvedValue(mockAiResponse);

      const result = await service.extractReceiptData(mockFile, {
        saveImage: true,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.image_url).toBeUndefined();
    });

    it('should skip image saving when saveImage is false', async () => {
      mockAiService.extractReceiptData.mockResolvedValue(mockAiResponse);

      const result = await service.extractReceiptData(mockFile, {
        saveImage: false,
      });

      expect(result.image_url).toBeUndefined();
      expect(mockStorageService.saveImage).not.toHaveBeenCalled();
    });

    it('should handle AI service failures', async () => {
      mockAiService.extractReceiptData.mockRejectedValue(
        new Error('AI service error'),
      );

      await expect(service.extractReceiptData(mockFile, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid files', async () => {
      const invalidFile = {
        ...mockFile,
        size: 0, // Empty file
      };

      await expect(service.extractReceiptData(invalidFile, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should determine status correctly based on data quality', async () => {
      // Test partial status with low confidence
      const lowConfidenceResponse = {
        ...mockAiResponse,
        confidence_score: 0.6, // Low confidence
      };

      mockAiService.extractReceiptData.mockResolvedValue(lowConfidenceResponse);
      mockStorageService.saveImage.mockResolvedValue('test.jpg');

      const result = await service.extractReceiptData(mockFile, {});
      expect(result.status).toBe('partial');
    });

    it('should determine failed status for missing critical data', async () => {
      const incompleteResponse = {
        ...mockAiResponse,
        vendor_name: '', // Missing vendor name
        receipt_items: [], // No items
      };

      mockAiService.extractReceiptData.mockResolvedValue(incompleteResponse);
      mockStorageService.saveImage.mockResolvedValue('test.jpg');

      const result = await service.extractReceiptData(mockFile, {});
      expect(result.status).toBe('failed');
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return array of supported currencies', () => {
      const currencies = service.getSupportedCurrencies();
      expect(Array.isArray(currencies)).toBe(true);
      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
      expect(currencies.length).toBeGreaterThan(10);
    });
  });

  describe('getServiceHealth', () => {
    it('should return healthy status', async () => {
      const health = await service.getServiceHealth();
      expect(health.status).toBe('healthy');
      expect(health.capabilities).toBeDefined();
      expect(health.version).toBe('1.0.0');
    });
  });

  describe('validateExtraction', () => {
    it('should validate consistent data', async () => {
      const consistentData = {
        vendor_name: 'Test Store',
        receipt_items: [{ item_name: 'Item', item_cost: 10 }],
        date: '2023-09-09',
        currency: 'USD',
        subtotal: 10,
        tax: 1,
        total: 11,
      };

      const validation = await service.validateExtraction(consistentData);
      expect(validation.isValid).toBe(true);
      expect(validation.warnings).toHaveLength(0);
    });

    it('should detect inconsistent data', async () => {
      const inconsistentData = {
        vendor_name: '',
        receipt_items: [],
        date: null,
        currency: 'USD',
        subtotal: 10,
        tax: 1,
        total: 20, // Wrong total
      };

      const validation = await service.validateExtraction(inconsistentData);
      expect(validation.isValid).toBe(false);
      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.suggestions.length).toBeGreaterThan(0);
    });
  });
});
