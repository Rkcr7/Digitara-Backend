import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import {
  ReceiptResponseDto,
  ReceiptItemResponseDto,
  ExtractionErrorResponseDto,
} from './receipt-response.dto';

describe('Receipt DTOs', () => {
  describe('ReceiptItemResponseDto', () => {
    it('should validate a correct receipt item', async () => {
      const itemData = {
        item_name: 'Test Item',
        item_cost: 10.99,
        quantity: 2,
        original_name: 'Original Name',
      };

      const item = plainToClass(ReceiptItemResponseDto, itemData);
      const errors = await validate(item);

      expect(errors).toHaveLength(0);
      expect(item.item_name).toBe('Test Item');
      expect(item.item_cost).toBe(10.99);
      expect(item.quantity).toBe(2);
    });

    it('should reject negative item cost', async () => {
      const itemData = {
        item_name: 'Test Item',
        item_cost: -5.99,
        quantity: 1,
      };

      const item = plainToClass(ReceiptItemResponseDto, itemData);
      const errors = await validate(item);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('min');
    });

    it('should reject invalid quantity', async () => {
      const itemData = {
        item_name: 'Test Item',
        item_cost: 10.99,
        quantity: 0,
      };

      const item = plainToClass(ReceiptItemResponseDto, itemData);
      const errors = await validate(item);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('min');
    });

    it('should handle decimal precision correctly', async () => {
      const itemData = {
        item_name: 'Test Item',
        item_cost: 10.999999,
      };

      const item = plainToClass(ReceiptItemResponseDto, itemData);

      // Transform should round to 2 decimal places
      expect(item.item_cost).toBe(11.0);
    });
  });

  describe('ReceiptResponseDto', () => {
    const validReceiptData = {
      status: 'success',
      extraction_id: 'test-123',
      date: '2023-09-09',
      currency: 'USD',
      vendor_name: 'Test Store',
      receipt_items: [
        {
          item_name: 'Item 1',
          item_cost: 10.0,
          quantity: 1,
        },
      ],
      subtotal: 10.0,
      tax: 1.0,
      total: 11.0,
      confidence_score: 0.95,
      extracted_at: '2023-09-09T10:00:00Z',
    };

    it('should validate a complete receipt response', async () => {
      const receipt = plainToClass(ReceiptResponseDto, validReceiptData);
      const errors = await validate(receipt);

      expect(errors).toHaveLength(0);
      expect(receipt.status).toBe('success');
      expect(receipt.currency).toBe('USD');
      expect(receipt.receipt_items).toHaveLength(1);
    });

    it('should reject invalid currency', async () => {
      const invalidData = {
        ...validReceiptData,
        currency: 'INVALID',
      };

      const receipt = plainToClass(ReceiptResponseDto, invalidData);
      const errors = await validate(receipt);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isIn');
    });

    it('should reject negative total', async () => {
      const invalidData = {
        ...validReceiptData,
        total: -5.0,
      };

      const receipt = plainToClass(ReceiptResponseDto, invalidData);
      const errors = await validate(receipt);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('min');
    });

    it('should reject invalid date format', async () => {
      const invalidData = {
        ...validReceiptData,
        date: 'invalid-date',
      };

      const receipt = plainToClass(ReceiptResponseDto, invalidData);
      const errors = await validate(receipt);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isDateString');
    });

    it('should validate nested receipt items', async () => {
      const dataWithInvalidItem = {
        ...validReceiptData,
        receipt_items: [
          {
            item_name: 'Valid Item',
            item_cost: 10.0,
          },
          {
            item_name: 'Invalid Item',
            item_cost: -5.0, // Invalid negative cost
          },
        ],
      };

      const receipt = plainToClass(ReceiptResponseDto, dataWithInvalidItem);
      const errors = await validate(receipt);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should handle monetary precision correctly', async () => {
      const precisionData = {
        ...validReceiptData,
        subtotal: 10.999,
        tax: 1.001,
        total: 12.0,
      };

      const receipt = plainToClass(ReceiptResponseDto, precisionData);

      expect(receipt.subtotal).toBe(11.0);
      expect(receipt.tax).toBe(1.0);
      expect(receipt.total).toBe(12.0);
    });
  });

  describe('ExtractionErrorResponseDto', () => {
    it('should validate error response', async () => {
      const errorData = {
        status: 'error',
        error_code: 'EXTRACTION_FAILED',
        message: 'Failed to extract receipt data',
        extraction_id: 'test-123',
        details: ['AI service unavailable', 'Invalid image format'],
        timestamp: '2023-09-09T10:00:00Z',
      };

      const errorResponse = plainToClass(ExtractionErrorResponseDto, errorData);
      const errors = await validate(errorResponse);

      expect(errors).toHaveLength(0);
      expect(errorResponse.status).toBe('error');
      expect(errorResponse.error_code).toBe('EXTRACTION_FAILED');
      expect(errorResponse.details).toHaveLength(2);
    });

    it('should require essential error fields', async () => {
      const incompleteErrorData = {
        status: 'error',
        // Missing error_code and message
        timestamp: '2023-09-09T10:00:00Z',
      };

      const errorResponse = plainToClass(
        ExtractionErrorResponseDto,
        incompleteErrorData,
      );
      const errors = await validate(errorResponse);

      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
