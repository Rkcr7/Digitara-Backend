import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { getEnhancedPrompt } from './prompts';

export interface ReceiptItemDto {
  item_name: string;
  item_cost: number;
  quantity?: number;
  original_name?: string;
}

export interface TaxDetailsDto {
  tax_rate?: string;
  tax_type?: string;
  tax_inclusive?: boolean;
  additional_taxes?: Array<{
    name: string;
    amount: number;
  }>;
}

// New DTO for image quality
export interface ImageQualityDto {
  is_clear: boolean;
  issues: string[];
}

export interface ExtractedReceiptData {
  date: string;
  currency: string;
  vendor_name: string;
  receipt_items: ReceiptItemDto[];
  subtotal?: number;
  tax: number;
  tax_details?: TaxDetailsDto;
  total: number;
  payment_method?: string;
  receipt_number?: string;
  image_quality?: ImageQualityDto;
  confidence_score?: number;
  extraction_metadata?: {
    processing_time: number;
    ai_model: string;
    warnings?: string[];
  };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai: OpenAI;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('gemini.apiKey');
    const baseURL = this.configService.get<string>('gemini.baseUrl');

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required for AI service');
    }

    this.openai = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  /**
   * Extract receipt data from image buffer
   * @param imageBuffer - Image buffer to process
   * @returns Promise<ExtractedReceiptData>
   */
  async extractReceiptData(imageBuffer: Buffer): Promise<ExtractedReceiptData> {
    const startTime = Date.now();
    let lastError: Error;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.log(`Extracting receipt data - Attempt ${attempt}`);

        const base64Image = imageBuffer.toString('base64');
        const response = await this.openai.chat.completions.create({
          model: 'gemini-2.0-flash',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: getEnhancedPrompt() },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                  },
                },
              ] as any,
            },
          ],
          temperature: 0.1, // Low temperature for consistent extraction
          max_tokens: 2000,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No response content from AI model');
        }

        // Parse and validate the JSON response
        const extractedData = this.parseAndValidateResponse(content);

        // Add extraction metadata
        const finalData = {
          ...extractedData,
          extraction_metadata: {
            processing_time: Date.now() - startTime,
            ai_model: 'gemini-2.0-flash',
            warnings: this.generateWarnings(extractedData),
          },
        };

        this.logger.log(
          `Receipt extraction successful in ${finalData.extraction_metadata.processing_time}ms`,
        );

        return finalData;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Extraction attempt ${attempt} failed: ${error.message}`,
        );

        // If it's a NOT_A_RECEIPT error, don't retry
        if (error.message?.startsWith('NOT_A_RECEIPT:')) {
          throw error; // Throw immediately without retrying
        }

        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * attempt);
        }
      }
    }

    this.logger.error('All extraction attempts failed', lastError);
    throw new BadRequestException(
      `Failed to extract receipt data after ${this.maxRetries} attempts: ${lastError.message}`,
    );
  }

  /**
   * Parse and validate AI response
   */
  private parseAndValidateResponse(content: string): ExtractedReceiptData {
    try {
      // Clean the response - remove any markdown formatting or extra text
      const cleanContent = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      // Log the cleaned content for debugging JSON parsing issues
      this.logger.debug('AI Response (cleaned):', cleanContent);

      const parsed = JSON.parse(cleanContent);

      // Check if it's a receipt first
      if (parsed.is_receipt === false) {
        throw new Error(
          `NOT_A_RECEIPT: ${parsed.reason || 'This image does not appear to be a receipt or invoice'}`,
        );
      }

      // Validate required fields
      if (!parsed.vendor_name) {
        throw new Error('Vendor name is required');
      }

      if (!parsed.receipt_items || parsed.receipt_items.length === 0) {
        throw new Error('At least one receipt item is required');
      }

      // Validate total, allowing null if image quality is poor
      if (parsed.image_quality && parsed.image_quality.is_clear === false) {
        if (parsed.total !== null && (typeof parsed.total !== 'number' || parsed.total < 0)) {
          throw new Error(
            'Total must be a positive number or null if image quality is poor',
          );
        }
      } else {
        // Strict validation for total if image quality is good or not specified as poor
        if (typeof parsed.total !== 'number' || parsed.total < 0) {
          throw new Error('Total must be a positive number');
        }
      }

      // Set defaults and validate data
      const validatedData = this.validateAndEnhanceData(parsed);

      return validatedData;
    } catch (error) {
      // If it's a NOT_A_RECEIPT error, preserve it
      if (error.message.startsWith('NOT_A_RECEIPT:')) {
        throw error;
      }
      // // Log the malformed content that caused the parsing error
      // this.logger.error('JSON parsing failed. Raw content that caused the error:', content);
      // this.logger.error('Parsing error details:', error.message);
      
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }
  }

  /**
   * Validate and enhance extracted data
   */
  private validateAndEnhanceData(data: any): ExtractedReceiptData {
    // Currency validation and inference
    const validCurrencies = [
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

    if (!validCurrencies.includes(data.currency)) {
      data.currency = this.inferCurrency(data);
    }

    // Date validation and formatting
    if (data.date) {
      data.date = this.parseAndFormatDate(data.date);
    }

    // Ensure tax_details exists
    if (!data.tax_details) {
      data.tax_details = {};
    }

    // Determine if tax is inclusive based on currency/region if not specified
    // This is only a fallback - the AI should have already detected explicit tax type mentions
    if (data.tax_details.tax_inclusive === undefined) {
      // European and Australian currencies typically use tax-inclusive pricing
      const taxInclusiveCurrencies = ['EUR', 'GBP', 'CHF', 'AUD', 'NZD'];
      data.tax_details.tax_inclusive = taxInclusiveCurrencies.includes(
        data.currency,
      );

      this.logger.log(
        `No explicit tax type found in receipt. Using currency default for ${data.currency}: tax_inclusive = ${data.tax_details.tax_inclusive}`,
      );
    } else {
      this.logger.log(
        `Explicit tax type detected from receipt: tax_inclusive = ${data.tax_details.tax_inclusive}`,
      );
    }

    // Calculate subtotal based on tax type
    if (data.tax_details.tax_inclusive) {
      // Tax-inclusive: subtotal should be total - tax
      if (!data.subtotal && data.total && data.tax) {
        data.subtotal = Number((data.total - data.tax).toFixed(2));
      }
    } else {
      // Tax-exclusive: Trust the AI's extracted subtotal if provided
      if (!data.subtotal && data.receipt_items) {
        // Only calculate from items if subtotal wasn't extracted
        const calculatedSubtotal = data.receipt_items.reduce(
          (sum, item) => sum + item.item_cost * (item.quantity || 1),
          0,
        );
        data.subtotal = Number(calculatedSubtotal.toFixed(2));
        this.logger.log(
          `Calculated subtotal from items: ${data.subtotal}. If incorrect, check if receipt shows explicit subtotal.`,
        );
      } else if (data.subtotal) {
        // Log when using AI-extracted subtotal
        this.logger.log(`Using AI-extracted subtotal: ${data.subtotal}`);
      }
    }

    // Handle multiple taxes: ensure tax field is the sum of all taxes
    if (
      data.tax_details?.additional_taxes &&
      data.tax_details.additional_taxes.length > 0
    ) {
      const totalTaxFromAdditional = data.tax_details.additional_taxes.reduce(
        (sum, tax) => sum + (tax.amount || 0),
        0,
      );

      // If tax field doesn't match the sum of additional taxes, use the sum
      if (Math.abs(data.tax - totalTaxFromAdditional) > 0.01) {
        this.logger.log(
          `Multiple taxes detected. Original tax: ${data.tax}, Sum of additional taxes: ${totalTaxFromAdditional}. Using sum.`,
        );
        data.tax = Number(totalTaxFromAdditional.toFixed(2));
      }
    }

    // Validate mathematical consistency based on tax type
    const tolerance = 0.01;
    let isValid = false;

    if (data.tax_details.tax_inclusive) {
      // For tax-inclusive: subtotal + tax should equal total
      const calculatedTotal = (data.subtotal || 0) + (data.tax || 0);
      isValid = Math.abs(calculatedTotal - data.total) <= tolerance;
    } else {
      // For tax-exclusive: subtotal + tax should equal total
      const calculatedTotal = (data.subtotal || 0) + (data.tax || 0);
      isValid = Math.abs(calculatedTotal - data.total) <= tolerance;
    }

    if (!isValid) {
      data.confidence_score = 0.8; // Lower confidence if totals don't match
    } else {
      data.confidence_score = 0.95;
    }

    // Adjust confidence score based on image quality
    if (data.image_quality && data.image_quality.is_clear === false) {
      if (data.total === null) {
        // Critical data missing due to very poor image quality
        data.confidence_score = 0.5;
        this.logger.log(
          `Very poor image quality (total is null). Setting confidence score to ${data.confidence_score}`,
        );
      } else {
        // Poor image quality, but total was extracted
        data.confidence_score = 0.7;
        this.logger.log(
          `Poor image quality (but total extracted). Setting confidence score to ${data.confidence_score}`,
        );
      }
    }

    // Ensure all monetary values are numbers
    data.total = Number(data.total) || 0;
    data.tax = Number(data.tax) || 0;
    if (data.subtotal) data.subtotal = Number(data.subtotal);

    return data;
  }

  /**
   * Generate warnings for potential issues
   */
  private generateWarnings(data: ExtractedReceiptData): string[] {
    const warnings = [];

    if (!data.date) warnings.push('Date could not be extracted');
    if (!data.vendor_name) warnings.push('Vendor name could not be determined');
    if (data.receipt_items.length === 0)
      warnings.push('No items could be extracted');

    // Add general image quality warnings
    if (
      data.image_quality &&
      data.image_quality.is_clear === false &&
      data.image_quality.issues &&
      data.image_quality.issues.length > 0
    ) {
      data.image_quality.issues.forEach((issue) => {
        warnings.push(`Image Quality: ${issue}`);
      });
    }

    // Add specific warnings for items affected by poor image quality
    if (data.image_quality && data.image_quality.is_clear === false) {
      data.receipt_items.forEach((item, index) => {
        if (item.item_name === 'Unknown Item (unclear image)') {
          warnings.push(
            `Image Quality: Item name for item ${index + 1} could not be identified due to poor readability.`,
          );
        }
        // Check if item_cost is 0.00 AND original_name is not null or "Unknown Item (unclear image)"
        // This helps differentiate from items that genuinely cost 0.00
        // However, the AI might return 0.00 for cost even if name is also unknown.
        // A more robust check might involve looking at original AI response if it included confidence per field.
        // For now, we'll assume if image quality is poor and cost is 0, it's likely due to readability.
        if (item.item_cost === 0.00) {
          warnings.push(
            `Image Quality: Item cost for '${item.item_name}' (item ${index + 1}) set to 0.00 due to poor readability or missing value.`,
          );
        }
      });
    }

    // Check mathematical consistency based on tax type
    const tolerance = 0.01;
    if (data.subtotal !== undefined && data.tax !== undefined) {
      const calculatedTotal = data.subtotal + data.tax;
      const difference = Math.abs(calculatedTotal - data.total);

      if (difference > tolerance) {
        warnings.push(
          `Mathematical validation: subtotal (${data.subtotal}) + tax (${data.tax}) does not equal total (${data.total})`,
        );
      }
    }

    if (data.confidence_score < 0.9) {
      warnings.push('Low confidence in extraction accuracy');
    }

    return warnings;
  }

  /**
   * Infer currency from vendor name, location, or other context
   */
  private inferCurrency(data: any): string {
    const vendorName = data.vendor_name?.toLowerCase() || '';

    // Common patterns for currency inference
    if (vendorName.includes('australia') || vendorName.includes('sydney')) {
      return 'AUD';
    }
    if (vendorName.includes('canada') || vendorName.includes('toronto')) {
      return 'CAD';
    }
    if (vendorName.includes('singapore')) {
      return 'SGD';
    }
    if (vendorName.includes('switzerland') || vendorName.includes('swiss')) {
      return 'CHF';
    }
    if (vendorName.includes('europe') || vendorName.includes('euro')) {
      return 'EUR';
    }
    if (vendorName.includes('uk') || vendorName.includes('britain')) {
      return 'GBP';
    }

    // Default to USD if cannot determine
    return 'USD';
  }

  /**
   * Parse and format date from various formats
   */
  private parseAndFormatDate(dateStr: string): string {
    try {
      // Handle various date formats
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return null;
      }
      return date.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }

  /**
   * Delay utility for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
