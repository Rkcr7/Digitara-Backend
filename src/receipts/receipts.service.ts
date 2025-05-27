import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { v4 as uuidv4 } from 'uuid';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { ReceiptsValidationService } from './receipts.validation.service';
import { DatabaseService } from '../database/database.service';
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
    private readonly databaseService: DatabaseService,
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
          imageUrl = await this.storageService.saveImage(
            file,
            extractionId,
          );
          this.logger.log(`Image saved: ${imageUrl}`);
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

      // Save to database (with error handling to not break the API response)
      try {
        const saveData = {
          extraction_id: extractionId,
          date: extractedData.date,
          currency: extractedData.currency || 'USD',
          vendor_name: extractedData.vendor_name || 'Unknown',
          subtotal: extractedData.subtotal,
          tax: extractedData.tax || 0,
          total: extractedData.total || 0,
          payment_method: extractedData.payment_method,
          receipt_number: extractedData.receipt_number,
          confidence_score: extractedData.confidence_score,
          image_url: imageUrl,
          status,
          receipt_items: extractedData.receipt_items || [],
          extraction_metadata: extractOptions.includeMetadata ? {
            processing_time: Date.now() - startTime,
            ai_model: extractedData.extraction_metadata?.ai_model || 'gemini-2.0-flash',
            warnings: allWarnings,
          } : undefined,
        };

        await this.databaseService.saveReceipt(saveData);
        this.logger.log(`Receipt data saved to database - ID: ${extractionId}`);
      } catch (dbError) {
        this.logger.warn(`Failed to save receipt to database: ${dbError.message}`);
        // Don't fail the API call if database save fails
      }

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
   * Get extraction by ID from database
   * @param extractionId - Extraction ID to look up
   * @returns Promise<ReceiptResponseDto | null>
   */
  async getExtractionById(
    extractionId: string,
  ): Promise<ReceiptResponseDto | null> {
    try {
      this.logger.log(`Looking up extraction by ID: ${extractionId}`);

      const savedReceipt = await this.databaseService.getReceiptByExtractionId(extractionId);
      
      if (!savedReceipt) {
        this.logger.log(`No receipt found for extraction ID: ${extractionId}`);
        return null;
      }

      // Convert database format back to API response format
      const responseData = {
        status: savedReceipt.status,
        extraction_id: savedReceipt.extraction_id,
        date: savedReceipt.date,
        currency: savedReceipt.currency,
        vendor_name: savedReceipt.vendor_name,
        receipt_items: savedReceipt.receipt_items.map(item => ({
          item_name: item.item_name,
          item_cost: item.item_cost,
          quantity: item.quantity,
          original_name: item.original_name,
        })),
        subtotal: savedReceipt.subtotal,
        tax: savedReceipt.tax,
        total: savedReceipt.total,
        payment_method: savedReceipt.payment_method,
        receipt_number: savedReceipt.receipt_number,
        confidence_score: savedReceipt.confidence_score,
        image_url: savedReceipt.image_url,
        extracted_at: savedReceipt.extracted_at,
        extraction_metadata: savedReceipt.extraction_metadata ? {
          processing_time: savedReceipt.extraction_metadata.processing_time,
          ai_model: savedReceipt.extraction_metadata.ai_model,
          warnings: savedReceipt.extraction_metadata.warnings,
        } : undefined,
      };

      const response = plainToInstance(ReceiptResponseDto, responseData, {
        excludeExtraneousValues: true,
      });

      this.logger.log(`Retrieved extraction from database - ID: ${extractionId}`);
      return response;

    } catch (error) {
      this.logger.error(`Failed to get extraction by ID ${extractionId}: ${error.message}`);
      return null;
    }
  }


  /**
   * Get all receipts with pagination
   * @param limit - Number of receipts to return (default: 50)
   * @param offset - Number of receipts to skip (default: 0)
   * @returns Promise<ReceiptResponseDto[]>
   */
  async getAllReceipts(limit: number = 50, offset: number = 0): Promise<ReceiptResponseDto[]> {
    try {
      this.logger.log(`Fetching ${limit} receipts with offset ${offset}`);

      const savedReceipts = await this.databaseService.getAllReceipts(limit, offset);
      
      const receipts = savedReceipts.map(savedReceipt => {
        const responseData = {
          status: savedReceipt.status,
          extraction_id: savedReceipt.extraction_id,
          date: savedReceipt.date,
          currency: savedReceipt.currency,
          vendor_name: savedReceipt.vendor_name,
          receipt_items: savedReceipt.receipt_items.map(item => ({
            item_name: item.item_name,
            item_cost: item.item_cost,
            quantity: item.quantity,
            original_name: item.original_name,
          })),
          subtotal: savedReceipt.subtotal,
          tax: savedReceipt.tax,
          total: savedReceipt.total,
          payment_method: savedReceipt.payment_method,
          receipt_number: savedReceipt.receipt_number,
          confidence_score: savedReceipt.confidence_score,
          image_url: savedReceipt.image_url,
          extracted_at: savedReceipt.extracted_at,
          extraction_metadata: savedReceipt.extraction_metadata ? {
            processing_time: savedReceipt.extraction_metadata.processing_time,
            ai_model: savedReceipt.extraction_metadata.ai_model,
            warnings: savedReceipt.extraction_metadata.warnings,
          } : undefined,
        };

        return plainToInstance(ReceiptResponseDto, responseData, {
          excludeExtraneousValues: true,
        });
      });

      this.logger.log(`Retrieved ${receipts.length} receipts from database`);
      return receipts;

    } catch (error) {
      this.logger.error(`Failed to get all receipts: ${error.message}`);
      throw error;
    }
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
