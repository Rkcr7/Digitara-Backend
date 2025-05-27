import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { v4 as uuidv4 } from 'uuid';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { ReceiptsValidationService } from './receipts.validation.service';
import {
  ExtractReceiptDto,
  ReceiptResponseDto,
  validateReceiptFile,
  validateExtractionConsistency,
} from './dto';

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly storageService: StorageService,
    private readonly validationService: ReceiptsValidationService,
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
      const status = this.validationService.determineExtractionStatus(extractedData, allWarnings);

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

      throw this.validationService.createExtractionError(
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
   * Validate extraction results and provide suggestions
   * @param data - Extracted receipt data
   * @returns Validation results with suggestions
   */
  async validateExtraction(data: any): Promise<{
    isValid: boolean;
    warnings: string[];
    suggestions: string[];
  }> {
    return this.validationService.validateExtraction(data);
  }

  /**
   * Get supported currencies for client reference
   * @returns Array of supported currency codes
   */
  getSupportedCurrencies(): string[] {
    return this.validationService.getSupportedCurrencies();
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
    return this.validationService.getServiceHealth();
  }
}
