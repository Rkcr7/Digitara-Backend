import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { AiService } from './ai.service';

// Mock OpenAI
const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
};

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => mockOpenAI);
});

describe('AiService', () => {
  let service: AiService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        'gemini.apiKey': 'test-api-key',
        'gemini.baseUrl':
          'https://generativelanguage.googleapis.com/v1beta/openai/',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    configService = module.get<ConfigService>(ConfigService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw error if GEMINI_API_KEY is not provided', () => {
    const mockConfigWithoutKey = {
      get: jest.fn(() => null),
    };

    expect(() => {
      const module = new AiService(mockConfigWithoutKey as any);
    }).toThrow('GEMINI_API_KEY is required for AI service');
  });

  describe('extractReceiptData', () => {
    const mockImageBuffer = Buffer.from('test-image-data');

    it('should successfully extract receipt data', async () => {
      const mockAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
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
                tax_details: {
                  tax_rate: '10%',
                  tax_type: 'Sales Tax',
                },
                total: 11.0,
                payment_method: 'Card',
                receipt_number: '12345',
              }),
            },
          },
        ],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockAIResponse);

      const result = await service.extractReceiptData(mockImageBuffer);

      expect(result).toBeDefined();
      expect(result.vendor_name).toBe('Test Store');
      expect(result.total).toBe(11.0);
      expect(result.receipt_items).toHaveLength(1);
      expect(result.extraction_metadata).toBeDefined();
      expect(result.extraction_metadata.ai_model).toBe('gemini-2.0-flash');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it('should handle AI service failures with retry', async () => {
      const mockAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                date: '2023-09-09',
                currency: 'USD',
                vendor_name: 'Test Store',
                receipt_items: [
                  {
                    item_name: 'Test Item',
                    item_cost: 10.0,
                  },
                ],
                tax: 1.0,
                total: 11.0,
              }),
            },
          },
        ],
      };

      // Fail first two attempts, succeed on third
      mockOpenAI.chat.completions.create
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockResolvedValueOnce(mockAIResponse);

      const result = await service.extractReceiptData(mockImageBuffer);

      expect(result).toBeDefined();
      expect(result.vendor_name).toBe('Test Store');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(
        new Error('Persistent error'),
      );

      await expect(service.extractReceiptData(mockImageBuffer)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(3);
    });

    it('should handle empty AI response', async () => {
      const mockAIResponse = {
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockAIResponse);

      await expect(service.extractReceiptData(mockImageBuffer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle invalid JSON response', async () => {
      const mockAIResponse = {
        choices: [
          {
            message: {
              content: 'Invalid JSON response',
            },
          },
        ],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockAIResponse);

      await expect(service.extractReceiptData(mockImageBuffer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle missing required fields', async () => {
      const mockAIResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                date: '2023-09-09',
                currency: 'USD',
                // Missing vendor_name
                receipt_items: [],
                total: 11.0,
              }),
            },
          },
        ],
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockAIResponse);

      await expect(service.extractReceiptData(mockImageBuffer)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validation methods', () => {
    it('should infer currency correctly', () => {
      const testData = { vendor_name: 'Store in Sydney, Australia' };
      const result = service['inferCurrency'](testData);
      expect(result).toBe('AUD');
    });

    it('should default to USD for unknown location', () => {
      const testData = { vendor_name: 'Unknown Store' };
      const result = service['inferCurrency'](testData);
      expect(result).toBe('USD');
    });

    it('should parse date correctly', () => {
      const result = service['parseAndFormatDate']('2023-09-09');
      expect(result).toBe('2023-09-09');
    });

    it('should return null for invalid date', () => {
      const result = service['parseAndFormatDate']('invalid-date');
      expect(result).toBeNull();
    });

    it('should generate appropriate warnings', () => {
      const testData = {
        date: null,
        currency: 'USD',
        vendor_name: 'Test Store',
        receipt_items: [],
        tax: 1.0,
        total: 11.0,
        confidence_score: 0.8,
      };

      const warnings = service['generateWarnings'](testData);
      expect(warnings).toContain('Date could not be extracted');
      expect(warnings).toContain('No items could be extracted');
      expect(warnings).toContain('Low confidence in extraction accuracy');
    });
  });
});
