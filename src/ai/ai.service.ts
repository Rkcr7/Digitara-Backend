import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

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
                { type: 'text', text: this.getEnhancedPrompt() },
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
   * Enhanced prompt for receipt extraction
   */
  private getEnhancedPrompt(): string {
    return `
You are an expert receipt parser. First, determine if this image is a receipt or invoice.

STEP 1 - RECEIPT DETECTION:
A receipt/invoice typically has:
- Store/vendor name
- Date of transaction
- List of items/services with prices
- Total amount
- May have tax information
- May have payment method

If this is NOT a receipt/invoice (e.g., it's a random photo, document, ID card, etc.), return:
{
  "is_receipt": false,
  "reason": "Brief explanation of what this image contains instead"
}

STEP 2 - IF IT IS A RECEIPT, extract ALL information:

IMPORTANT INSTRUCTIONS:
1. Detect the currency from the receipt (look for currency symbols like $, €, £, ₹, or codes like USD, EUR, CHF, SGD, AUD, CAD, INR)
2. If currency symbol is ambiguous ($), infer from store location or context
3. Parse dates in any format and convert to YYYY-MM-DD
4. Extract ALL line items, even if they have different formats
5. IMPORTANT: If the receipt shows a subtotal explicitly (before tax), use that exact value instead of calculating from items
6. Handle grouped sections (e.g., "FOOD", "BEVERAGES") - include both individual items AND section totals if shown
7. CRITICAL: Determine if tax is INCLUSIVE or EXCLUSIVE:
   - Tax-INCLUSIVE (common in Europe, Australia, etc): Tax is already included in the total. Look for phrases like "incl. VAT", "incl. MwSt", "GST inclusive", "including tax", "tax included"
   - Tax-EXCLUSIVE (common in USA, India): Tax is added on top of subtotal. Total = Subtotal + Tax. Look for phrases like "plus tax", "excl. tax", "tax extra", "excluding tax", "+ tax", or separate tax line items (GST, CGST, SGST)
   - IMPORTANT: If the receipt explicitly states tax type (e.g., "excl. MwSt", "plus VAT"), use that information regardless of currency defaults
   - Only use currency-based defaults if no explicit tax information is found on the receipt
8. Handle multiple tax types (e.g., GST, VAT, MwSt, Sales Tax, CGST, SGST, Alcohol Tax)
9. If information is in a foreign language, translate item names to English
10. Handle edge cases like discounts, tips, or special charges
11. If any field cannot be determined, use null
12. For tax-inclusive receipts: Calculate subtotal = total - tax
13. For tax-exclusive receipts: Ensure total = subtotal + tax
14. CRITICAL: Extract monetary values EXACTLY as shown on the receipt without rounding

OUTPUT FORMAT (return ONLY valid JSON, no additional text):
{
  "is_receipt": true,
  "date": "YYYY-MM-DD or null",
  "currency": "3-letter code (USD, EUR, CAD, AUD, SGD, CHF, INR, etc.)",
  "vendor_name": "Store/Restaurant/Business name",
  "receipt_items": [
    {
      "item_name": "Item description in English",
      "item_cost": 0.00,
      "quantity": 1,
      "original_name": "Original name if not in English or null"
    }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "tax_details": {
    "tax_rate": "percentage if shown or null",
    "tax_type": "GST/VAT/MwSt/Sales Tax/etc or null",
    "tax_inclusive": true/false,
    "additional_taxes": [
      {
        "name": "CGST/SGST/etc if multiple taxes",
        "amount": 0.00
      }
    ]
  },
  "total": 0.00,
  "payment_method": "Cash/Card/etc or null",
  "receipt_number": "receipt/transaction number or null"
}

VALIDATION RULES:
- All monetary values must be positive numbers or 0
- Currency must be a valid 3-letter code
- Date must be in YYYY-MM-DD format or null
- Items array cannot be empty (at least one item must be extracted)
- For tax-inclusive: subtotal = total - tax
- For tax-exclusive: total = subtotal + tax
- tax_inclusive MUST be set to true or false based on receipt format
- Extract values EXACTLY as shown on receipt (e.g., if subtotal shows 5880.00, use 5880.00, not 5879.20)
`;
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

      if (typeof parsed.total !== 'number' || parsed.total < 0) {
        throw new Error('Total must be a positive number');
      }

      // Set defaults and validate data
      const validatedData = this.validateAndEnhanceData(parsed);

      return validatedData;
    } catch (error) {
      // If it's a NOT_A_RECEIPT error, preserve it
      if (error.message.startsWith('NOT_A_RECEIPT:')) {
        throw error;
      }
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
