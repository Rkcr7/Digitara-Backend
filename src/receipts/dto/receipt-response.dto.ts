import { Exclude, Expose, Transform, Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
  Min,
  IsIn,
} from 'class-validator';

export class ReceiptItemResponseDto {
  @IsString()
  @Expose()
  item_name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Item cost must be positive' })
  @Transform(({ value }) => Number(Number(value).toFixed(2)))
  @Expose()
  item_cost: number;

  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'Quantity must be at least 1' })
  @Expose()
  quantity?: number;

  @IsOptional()
  @IsString()
  @Expose()
  original_name?: string;
}

export class TaxDetailsResponseDto {
  @IsOptional()
  @IsString()
  @Expose()
  tax_rate?: string;

  @IsOptional()
  @IsString()
  @Expose()
  tax_type?: string;

  @IsOptional()
  @IsArray()
  @Expose()
  additional_taxes?: Array<{
    name: string;
    amount: number;
  }>;
}

export class ExtractionMetadataDto {
  @IsNumber()
  @Expose()
  processing_time: number;

  @IsString()
  @Expose()
  ai_model: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Expose()
  warnings?: string[];
}

export class ReceiptResponseDto {
  /**
   * Extraction success status
   */
  @IsString()
  @Expose()
  status: 'success' | 'partial' | 'failed';

  /**
   * Unique identifier for this extraction
   */
  @IsString()
  @Expose()
  extraction_id: string;

  /**
   * Receipt date in YYYY-MM-DD format
   */
  @IsOptional()
  @IsDateString({}, { message: 'Date must be in YYYY-MM-DD format' })
  @Expose()
  date?: string;

  /**
   * Currency code (ISO 4217)
   */
  @IsString()
  @IsIn([
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
  ])
  @Expose()
  currency: string;

  /**
   * Vendor/Store name
   */
  @IsString()
  @Expose()
  vendor_name: string;

  /**
   * Array of extracted receipt items
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemResponseDto)
  @Expose()
  receipt_items: ReceiptItemResponseDto[];

  /**
   * Subtotal amount (before tax)
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(({ value }) =>
    value ? Number(Number(value).toFixed(2)) : undefined,
  )
  @Expose()
  subtotal?: number;

  /**
   * Tax amount
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(({ value }) => Number(Number(value).toFixed(2)))
  @Expose()
  tax: number;

  /**
   * Tax details (rate, type, etc.)
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => TaxDetailsResponseDto)
  @Expose()
  tax_details?: TaxDetailsResponseDto;

  /**
   * Total amount
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(({ value }) => Number(Number(value).toFixed(2)))
  @Expose()
  total: number;

  /**
   * Payment method (if detected)
   */
  @IsOptional()
  @IsString()
  @Expose()
  payment_method?: string;

  /**
   * Receipt number (if available)
   */
  @IsOptional()
  @IsString()
  @Expose()
  receipt_number?: string;

  /**
   * Confidence score (0-1)
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(({ value }) =>
    value ? Number(Number(value).toFixed(2)) : undefined,
  )
  @Expose()
  confidence_score?: number;

  /**
   * URL to the original image (if saved)
   */
  @IsOptional()
  @IsString()
  @Expose()
  image_url?: string;

  /**
   * Extraction metadata (optional, only if requested)
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => ExtractionMetadataDto)
  @Expose()
  extraction_metadata?: ExtractionMetadataDto;

  /**
   * Timestamp when extraction was performed
   */
  @IsDateString()
  @Expose()
  extracted_at: string;
}

/**
 * Error response DTO for failed extractions
 */
export class ExtractionErrorResponseDto {
  @IsString()
  @Expose()
  status: 'error';

  @IsString()
  @Expose()
  error_code: string;

  @IsString()
  @Expose()
  message: string;

  @IsOptional()
  @IsString()
  @Expose()
  extraction_id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Expose()
  details?: string[];

  @IsDateString()
  @Expose()
  timestamp: string;
}
