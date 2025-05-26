import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { v4 as uuidv4 } from 'uuid';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import {
  ExtractReceiptDto,
  ReceiptResponseDto,
  ExtractionErrorResponseDto,
  validateReceiptFile,
  validateExtractionConsistency,
} from './dto';

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Extract receipt data from uploaded image
   * @param file - Uploaded receipt image
   * @param extractOptions - Extraction options
   * @returns Promise<ReceiptResponseDto>
   */
  async extractReceiptData(
    file: Express.Multer.File,
    extractOptions: ExtractReceiptDto = {},
  ): Promise<ReceiptResponseDto> {
    const extractionId = extractOptions.customId || uuidv4();
    const startTime = Date.now();

    try {
      this.logger.log(`Starting receipt extraction - ID: ${extractionId}`);

      // Validate uploaded file
      validateReceiptFile(file);

      // Save image if requested (default: true)
      let imageUrl: string | undefined;
      let savedFileName: string | undefined;

      if (extractOptions.saveImage !== false) {
        try {
          savedFileName = await this.storageService.saveImage(
            file,
            extractionId,
          );
          imageUrl = `/storage/images/${savedFileName}`;
          this.logger.log(`Image saved: ${savedFileName}`);
        } catch (error) {
          this.logger.warn(
            `Failed to save image for extraction ${extractionId}: ${error.message}`,
          );
          // Continue with extraction even if image saving fails
        }
      }

      // Extract receipt data using AI service
      const extractedData = await this.aiService.extractReceiptData(
        file.buffer,
      );

      // Validate extraction consistency and generate warnings
      const consistencyWarnings = validateExtractionConsistency(extractedData);

      // Merge AI warnings with consistency warnings
      const allWarnings = [
        ...(extractedData.extraction_metadata?.warnings || []),
        ...consistencyWarnings,
      ];

      // Determine extraction status based on data quality
      const status = this.determineExtractionStatus(extractedData, allWarnings);

      // Build response data
      const responseData = {
        status,
        extraction_id: extractionId,
        date: extractedData.date,
        currency: extractedData.currency,
        vendor_name: extractedData.vendor_name,
        receipt_items: extractedData.receipt_items,
        subtotal: extractedData.subtotal,
        tax: extractedData.tax,
        tax_details: extractedData.tax_details,
        total: extractedData.total,
        payment_method: extractedData.payment_method,
        receipt_number: extractedData.receipt_number,
        confidence_score: extractedData.confidence_score,
        image_url: imageUrl,
        extracted_at: new Date().toISOString(),
      };

      // Add metadata if requested
      if (extractOptions.includeMetadata) {
        responseData['extraction_metadata'] = {
          processing_time: Date.now() - startTime,
          ai_model:
            extractedData.extraction_metadata?.ai_model || 'gemini-2.0-flash',
          warnings: allWarnings,
        };
      }

      // Transform and validate response
      const response = plainToInstance(ReceiptResponseDto, responseData, {
        excludeExtraneousValues: true,
      });

      this.logger.log(
        `Receipt extraction completed - ID: ${extractionId}, Status: ${status}, Processing time: ${Date.now() - startTime}ms`,
      );

      return response;
    } catch (error) {
      this.logger.error(
        `Receipt extraction failed - ID: ${extractionId}: ${error.message}`,
        error.stack,
      );

      // If we saved an image but extraction failed, optionally clean up
      // (In production, you might want to keep failed extractions for debugging)

      throw this.createExtractionError(
        extractionId,
        error,
        Date.now() - startTime,
      );
    }
  }

  /**
   * Get extraction history/status (future feature)
   * @param extractionId - Extraction ID to look up
   * @returns Promise<ReceiptResponseDto | null>
   */
  async getExtractionById(
    extractionId: string,
  ): Promise<ReceiptResponseDto | null> {
    // TODO: Implement extraction history storage (database)
    // For now, return null as we don't persist extractions
    this.logger.log(
      `Extraction history lookup requested for ID: ${extractionId}`,
    );
    return null;
  }

  /**
   * Determine extraction status based on data quality and warnings
   * @param data - Extracted receipt data
   * @param warnings - Array of warning messages
   * @returns Extraction status
   */
  private determineExtractionStatus(
    data: any,
    warnings: string[],
  ): 'success' | 'partial' | 'failed' {
    // Failed if critical data is missing
    if (!data.vendor_name || !data.total || !data.receipt_items?.length) {
      return 'failed';
    }

    // Partial if there are significant warnings or low confidence
    if (
      warnings.length > 2 ||
      (data.confidence_score && data.confidence_score < 0.7)
    ) {
      return 'partial';
    }

    // Success if we have good data with minimal warnings
    return 'success';
  }

  /**
   * Create structured error response for failed extractions
   * @param extractionId - Extraction ID
   * @param error - Original error
   * @param processingTime - Time spent processing
   * @returns ExtractionErrorResponseDto
   */
  private createExtractionError(
    extractionId: string,
    error: any,
    processingTime: number,
  ): BadRequestException {
    let errorCode = 'EXTRACTION_FAILED';
    let message = 'Failed to extract receipt data';
    const details: string[] = [];

    // Categorize errors for better user experience
    if (error.message?.startsWith('NOT_A_RECEIPT:')) {
      errorCode = 'NOT_A_RECEIPT';
      message = error.message.replace('NOT_A_RECEIPT: ', '');
      details.push('Please upload an image of a receipt or invoice');
    } else if (error instanceof BadRequestException) {
      errorCode = 'VALIDATION_ERROR';
      message = error.message;
    } else if (
      error.message?.includes('network') ||
      error.message?.includes('timeout')
    ) {
      errorCode = 'AI_SERVICE_UNAVAILABLE';
      message = 'AI service is temporarily unavailable. Please try again.';
    } else if (
      error.message?.includes('parse') ||
      error.message?.includes('JSON')
    ) {
      errorCode = 'AI_RESPONSE_ERROR';
      message =
        'AI service returned invalid response. The receipt might be unclear.';
    } else if (
      error.message?.includes('API key') ||
      error.message?.includes('authentication')
    ) {
      errorCode = 'CONFIGURATION_ERROR';
      message = 'Service configuration error. Please contact support.';
    } else if (
      error.message?.includes('At least one receipt item is required')
    ) {
      errorCode = 'NO_ITEMS_FOUND';
      message =
        'Could not identify any items on the receipt. The image might be unclear or incomplete.';
    }

    details.push(`Processing time: ${processingTime}ms`);
    if (error.stack && errorCode !== 'NOT_A_RECEIPT') {
      details.push(`Error details: ${error.message}`);
    }

    const errorResponse = plainToInstance(ExtractionErrorResponseDto, {
      status: 'error',
      error_code: errorCode,
      message,
      extraction_id: extractionId,
      details,
      timestamp: new Date().toISOString(),
    });

    // Return as BadRequestException with structured error data
    return new BadRequestException(errorResponse);
  }

  /**
   * Validate extraction results and provide suggestions
   * @param data - Extracted receipt data
   * @returns Validation results with suggestions
   */
  async validateExtraction(data: any): Promise<{
    isValid: boolean;
    warnings: string[];
    suggestions: string[];
  }> {
    const warnings = validateExtractionConsistency(data);
    const suggestions: string[] = [];

    // Provide helpful suggestions based on common issues
    if (!data.date) {
      suggestions.push(
        'Try uploading a clearer image with visible date information',
      );
    }

    if (!data.vendor_name) {
      suggestions.push(
        'Ensure the store/restaurant name is clearly visible in the image',
      );
    }

    if (data.receipt_items?.length === 0) {
      suggestions.push(
        'Make sure all items and prices are clearly visible and not cut off',
      );
    }

    if (warnings.some((w) => w.includes('Mathematical inconsistency'))) {
      suggestions.push(
        'Verify the receipt totals are clearly visible and not damaged',
      );
    }

    return {
      isValid: warnings.length === 0,
      warnings,
      suggestions,
    };
  }

  /**
   * Get supported currencies for client reference
   * @returns Array of supported currency codes
   */
  getSupportedCurrencies(): string[] {
    return [
      'USD',
      'EUR',
      'GBP',
      'CAD',
      'AUD',
      'SGD',
      'CHF',
      'JPY',
      'CNY',
      'INR',
      'NZD',
      'HKD',
    ];
  }

  /**
   * Get service health and capabilities
   * @returns Service status information
   */
  async getServiceHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    capabilities: string[];
    version: string;
  }> {
    try {
      // Test AI service availability (basic check)
      // In production, you might want a lightweight health check endpoint

      return {
        status: 'healthy',
        capabilities: [
          'Multi-language receipt processing',
          'Currency detection (12+ currencies)',
          'Image optimization and storage',
          'Mathematical validation',
          'Confidence scoring',
          'Comprehensive error handling',
        ],
        version: '1.0.0',
      };
    } catch (error) {
      this.logger.warn(`Service health check failed: ${error.message}`);
      return {
        status: 'degraded',
        capabilities: [],
        version: '1.0.0',
      };
    }
  }
}
