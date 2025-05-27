import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';

describe('ReceiptsService', () => {
  let service: ReceiptsService;

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

    // Scenario 1: Successful extraction from valid image
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

    // Scenario 2: Incorrect file type tests
    describe('incorrect file type', () => {
      it('should reject PDF files', async () => {
        const pdfFile = {
          ...mockFile,
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
        };

        await expect(service.extractReceiptData(pdfFile, {})).rejects.toThrow(
          BadRequestException,
        );
        await expect(service.extractReceiptData(pdfFile, {})).rejects.toThrow(
          'Invalid file type. Allowed types: image/jpeg, image/jpg, image/png, image/webp. Received: application/pdf',
        );
      });

      it('should reject text files', async () => {
        const textFile = {
          ...mockFile,
          originalname: 'receipt.txt',
          mimetype: 'text/plain',
        };

        await expect(service.extractReceiptData(textFile, {})).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should reject GIF images', async () => {
        const gifFile = {
          ...mockFile,
          originalname: 'animated.gif',
          mimetype: 'image/gif',
        };

        await expect(service.extractReceiptData(gifFile, {})).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should reject files with mismatched extension and mimetype', async () => {
        const fakeFile = {
          ...mockFile,
          originalname: 'fake.jpg',
          mimetype: 'text/html',
        };

        await expect(service.extractReceiptData(fakeFile, {})).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    // Scenario 3: Invalid response from AI model
    describe('invalid AI model responses', () => {
      it('should handle empty response from AI model', async () => {
        mockStorageService.saveImage.mockResolvedValue('test.jpg');
        mockAiService.extractReceiptData.mockResolvedValue(null);

        await expect(service.extractReceiptData(mockFile, {})).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should handle poorly-formed response missing required fields', async () => {
        const malformedResponse = {
          // Missing vendor_name, date, currency, etc.
          receipt_items: [],
          total: 'not-a-number', // Invalid type
        };

        mockStorageService.saveImage.mockResolvedValue('test.jpg');
        mockAiService.extractReceiptData.mockResolvedValue(malformedResponse);

        const result = await service.extractReceiptData(mockFile, {
          includeMetadata: true, // Make sure metadata is included
        });

        // Should still return but with failed status
        expect(result.status).toBe('failed');
        // Check that we have a failed status (critical data missing)
        expect(result.vendor_name).toBeFalsy();
        expect(result.receipt_items).toHaveLength(0);
      });

      it('should handle AI response with invalid data types', async () => {
        const invalidTypeResponse = {
          ...mockAiResponse,
          total: 'invalid-number',
          tax: 'invalid-tax',
          receipt_items: 'not-an-array', // Should be array
        };

        mockStorageService.saveImage.mockResolvedValue('test.jpg');
        mockAiService.extractReceiptData.mockResolvedValue(invalidTypeResponse);

        const result = await service.extractReceiptData(mockFile, {});

        // Type coercion might still result in valid data
        // Check if the service transforms the data properly
        expect(result).toBeDefined();
        expect(result.status).toBeDefined();
        // The response should have numeric values after transformation
        expect(typeof result.total).toBe('number');
        expect(typeof result.tax).toBe('number');
      });

      it('should handle AI response with NOT_A_RECEIPT error', async () => {
        const notReceiptError = new Error(
          'NOT_A_RECEIPT: This image does not appear to be a receipt',
        );
        notReceiptError.name = 'NOT_A_RECEIPT';

        mockStorageService.saveImage.mockResolvedValue('test.jpg');
        mockAiService.extractReceiptData.mockRejectedValue(notReceiptError);

        await expect(service.extractReceiptData(mockFile, {})).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    // Scenario 4: 500 status response tests
    describe('500 status response scenarios', () => {
      it('should handle AI service network errors', async () => {
        const networkError = new Error(
          'Network error: Unable to reach AI service',
        );
        networkError['code'] = 'ECONNREFUSED';

        mockStorageService.saveImage.mockResolvedValue('test.jpg');
        mockAiService.extractReceiptData.mockRejectedValue(networkError);

        await expect(service.extractReceiptData(mockFile, {})).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should handle AI service timeout errors', async () => {
        const timeoutError = new Error('Request timeout');
        timeoutError['code'] = 'ETIMEDOUT';

        mockStorageService.saveImage.mockResolvedValue('test.jpg');
        mockAiService.extractReceiptData.mockRejectedValue(timeoutError);

        await expect(service.extractReceiptData(mockFile, {})).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should handle unexpected server errors', async () => {
        const serverError = new Error('Internal server error');
        serverError['response'] = { status: 500 };

        mockStorageService.saveImage.mockResolvedValue('test.jpg');
        mockAiService.extractReceiptData.mockRejectedValue(serverError);

        await expect(service.extractReceiptData(mockFile, {})).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should handle rate limiting errors', async () => {
        const rateLimitError = new Error('Rate limit exceeded');
        rateLimitError['response'] = { status: 429 };

        mockStorageService.saveImage.mockResolvedValue('test.jpg');
        mockAiService.extractReceiptData.mockRejectedValue(rateLimitError);

        await expect(service.extractReceiptData(mockFile, {})).rejects.toThrow(
          BadRequestException,
        );
      });
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
