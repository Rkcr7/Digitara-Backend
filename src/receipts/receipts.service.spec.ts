import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { ReceiptsValidationService } from './receipts.validation.service';
import { DatabaseService } from '../database/database.service';

describe('ReceiptsService', () => {
  let service: ReceiptsService;

  const mockAiService = {
    extractReceiptData: jest.fn(),
  };

  const mockStorageService = {
    saveImage: jest.fn(),
  };

  const mockReceiptsValidationService = {
    determineExtractionStatus: jest.fn(),
    createExtractionError: jest.fn().mockImplementation((extractionId, error, processingTime) => {
      return new BadRequestException(error.message || 'Mocked extraction error from createExtractionError');
    }),
    validateExtraction: jest.fn(),
    getSupportedCurrencies: jest.fn(),
    getServiceHealth: jest.fn(),
  };

  const mockDatabaseService = {
    saveReceipt: jest.fn(),
    getReceiptByExtractionId: jest.fn(),
    getAllReceipts: jest.fn(),
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
        {
          provide: ReceiptsValidationService,
          useValue: mockReceiptsValidationService,
        },
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<ReceiptsService>(ReceiptsService);
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
    // This test verifies the end-to-end successful extraction flow:
    // - Image saving (mocked)
    // - AI data extraction (mocked)
    // - Status determination (mocked)
    // - Database saving (mocked)
    // - Correct response structure and data
    it('should extract receipt data successfully', async () => {
      const mockImageUrl = 'https://supabase.co/storage/test-123.jpg';
      mockStorageService.saveImage.mockResolvedValue(mockImageUrl);
      mockAiService.extractReceiptData.mockResolvedValue(mockAiResponse);
      mockReceiptsValidationService.determineExtractionStatus.mockReturnValue('success');
      mockDatabaseService.saveReceipt.mockResolvedValue({ id: 'db-id-123' });

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
      expect(result.image_url).toBe(mockImageUrl);
      expect(result.extraction_metadata).toBeDefined();
      expect(mockStorageService.saveImage).toHaveBeenCalledWith(
        mockFile,
        'test-123',
      );
      expect(mockAiService.extractReceiptData).toHaveBeenCalledWith(
        mockFile.buffer,
      );
      expect(mockDatabaseService.saveReceipt).toHaveBeenCalled();
    });

    // Scenario 2: Incorrect file type tests
    describe('incorrect file type', () => {
      // This test ensures that PDF files, which are not supported, are rejected.
      // It checks if a BadRequestException is thrown with the correct error message.
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
    });

    // Scenario 3: Invalid response from AI model
    describe('invalid AI model responses', () => {
      // This test checks how the service handles a null (empty) response from the AI service.
      // It expects a BadRequestException indicating an invalid AI response.
      it('should handle empty response from AI model', async () => {
        mockStorageService.saveImage.mockResolvedValue('test.jpg');
        mockAiService.extractReceiptData.mockResolvedValue(null);
        // Ensure createExtractionError is reset or specifically mocked for this test if its behavior needs to differ
        mockReceiptsValidationService.createExtractionError.mockImplementationOnce(() => {
          return new BadRequestException('Invalid AI response');
        });

        await expect(service.extractReceiptData(mockFile, {})).rejects.toThrow(
          BadRequestException,
        );
      });

      // This test simulates the AI service identifying the image as not a receipt.
      // It expects a BadRequestException with a 'NOT_A_RECEIPT' message.
      it('should handle AI response with NOT_A_RECEIPT error', async () => {
        const notReceiptError = new Error(
          'NOT_A_RECEIPT: This image does not appear to be a receipt',
        );
        notReceiptError.name = 'NOT_A_RECEIPT';

        mockStorageService.saveImage.mockResolvedValue('test.jpg');
        mockAiService.extractReceiptData.mockRejectedValue(notReceiptError);
        mockReceiptsValidationService.createExtractionError.mockImplementationOnce(() => {
          return new BadRequestException('NOT_A_RECEIPT');
        });

        await expect(service.extractReceiptData(mockFile, {})).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    // Scenario 4: 500 status response tests (AI Service Issues)
    describe('500 status response scenarios', () => {
      // This test simulates a network error when trying to reach the AI service.
      // It expects a BadRequestException indicating the AI service is unavailable.
      it('should handle AI service network errors', async () => {
        const networkError = new Error(
          'Network error: Unable to reach AI service',
        );
        networkError['code'] = 'ECONNREFUSED';

        mockStorageService.saveImage.mockResolvedValue('test.jpg');
        mockAiService.extractReceiptData.mockRejectedValue(networkError);
        mockReceiptsValidationService.createExtractionError.mockImplementationOnce(() => {
          return new BadRequestException('Network error');
        });

        await expect(service.extractReceiptData(mockFile, {})).rejects.toThrow(
          BadRequestException,
        );
      });

      // This test simulates an unexpected 500 server error from the AI service.
      // It expects a BadRequestException indicating a server error.
      it('should handle unexpected server errors', async () => {
        const serverError = new Error('Internal server error');
        serverError['response'] = { status: 500 };

        mockStorageService.saveImage.mockResolvedValue('test.jpg');
        mockAiService.extractReceiptData.mockRejectedValue(serverError);
        mockReceiptsValidationService.createExtractionError.mockImplementationOnce(() => {
          return new BadRequestException('Server error');
        });

        await expect(service.extractReceiptData(mockFile, {})).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    // This test verifies that extracted data is correctly prepared and passed to the database service for saving.
    it('should save extraction data to database successfully', async () => {
      mockStorageService.saveImage.mockResolvedValue('https://supabase.co/test.jpg');
      mockAiService.extractReceiptData.mockResolvedValue(mockAiResponse);
      mockReceiptsValidationService.determineExtractionStatus.mockReturnValue('success');
      mockDatabaseService.saveReceipt.mockResolvedValue({ 
        id: 'db-123',
        extraction_id: 'test-123'
      });

      await service.extractReceiptData(mockFile, {
        customId: 'test-123',
        includeMetadata: true,
      });

      expect(mockDatabaseService.saveReceipt).toHaveBeenCalledWith(expect.objectContaining({
        extraction_id: 'test-123',
        status: 'success',
      }));
    });

    // This test ensures the service continues to return a successful response to the user
    // even if saving the extraction data to the database fails.
    it('should continue successfully even when database save fails', async () => {
      mockStorageService.saveImage.mockResolvedValue('test.jpg');
      mockAiService.extractReceiptData.mockResolvedValue(mockAiResponse);
      mockReceiptsValidationService.determineExtractionStatus.mockReturnValue('success');
      mockDatabaseService.saveReceipt.mockRejectedValue(new Error('Database connection failed'));

      const result = await service.extractReceiptData(mockFile, {});

      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(mockDatabaseService.saveReceipt).toHaveBeenCalled();
    });
  });

  describe('getExtractionById', () => {
    const mockSavedReceipt = {
      id: 'db-123',
      extraction_id: 'test-extraction-id',
      date: '2023-09-09',
      currency: 'USD',
      vendor_name: 'Test Store',
      subtotal: 10.0,
      tax: 1.0,
      total: 11.0,
      payment_method: 'Credit Card',
      receipt_number: 'REC-001',
      confidence_score: 0.95,
      image_url: 'https://supabase.co/test.jpg',
      status: 'success',
      extracted_at: '2023-09-09T10:00:00Z',
      receipt_items: [
        {
          id: 'item-1',
          item_name: 'Test Item',
          item_cost: 10.0,
          quantity: 1,
          original_name: 'Test Item',
        },
      ],
      extraction_metadata: {
        processing_time: 1500,
        ai_model: 'gemini-2.0-flash',
        warnings: [],
      },
    };

    it('should retrieve extraction by ID successfully', async () => {
      mockDatabaseService.getReceiptByExtractionId.mockResolvedValue(mockSavedReceipt);

      const result = await service.getExtractionById('test-extraction-id');

      expect(result).toBeDefined();
      expect(result.extraction_id).toBe('test-extraction-id');
      expect(mockDatabaseService.getReceiptByExtractionId).toHaveBeenCalledWith('test-extraction-id');
    });
  });

  describe('getAllReceipts', () => {
    const mockReceiptsList = [
      {
        id: 'db-1',
        extraction_id: 'ext-1',
        vendor_name: 'Store 1',
        total: 10.0,
        receipt_items: [],
      },
    ];

    it('should retrieve paginated receipts successfully', async () => {
      mockDatabaseService.getAllReceipts.mockResolvedValue(mockReceiptsList);
      const result = await service.getAllReceipts(10, 0);
      expect(result).toHaveLength(1);
      expect(mockDatabaseService.getAllReceipts).toHaveBeenCalledWith(10, 0);
    });
  });

  describe('getServiceHealth', () => {
    it('should return healthy status', async () => {
      mockReceiptsValidationService.getServiceHealth.mockResolvedValue({
        status: 'healthy',
        capabilities: ['test-capability'],
        version: '1.0.0',
      });
      const health = await service.getServiceHealth();
      expect(health.status).toBe('healthy');
    });
  });
});
