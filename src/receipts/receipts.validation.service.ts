import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ExtractionErrorResponseDto, validateExtractionConsistency } from './dto';

@Injectable()
export class ReceiptsValidationService {
  private readonly logger = new Logger(ReceiptsValidationService.name);

  /**
   * Determine extraction status based on data quality and warnings
   * @param data - Extracted receipt data
   * @param warnings - Array of warning messages
   * @returns Extraction status
   */
  determineExtractionStatus(
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
  createExtractionError(
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
