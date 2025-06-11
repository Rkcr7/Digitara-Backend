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
  IsBoolean,
} from 'class-validator';

/**
 * DTO for updating individual receipt items
 */
export class UpdateReceiptItemDto {
  @IsOptional()
  @IsString()
  @Expose()
  item_name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Item cost must be positive' })
  @Transform(({ value }) => value ? Number(Number(value).toFixed(2)) : undefined)
  @Expose()
  item_cost?: number;

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

/**
 * DTO for updating tax details
 */
export class UpdateTaxDetailsDto {
  @IsOptional()
  @IsString()
  @Expose()
  tax_rate?: string;

  @IsOptional()
  @IsString()
  @Expose()
  tax_type?: string;

  @IsOptional()
  @IsBoolean()
  @Expose()
  tax_inclusive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Expose()
  additional_taxes?: Array<{
    name: string;
    amount: number;
  }>;
}

/**
 * DTO for updating extraction metadata (admin/system use)
 */
export class UpdateExtractionMetadataDto {
  @IsOptional()
  @IsNumber()
  @Expose()
  processing_time?: number;

  @IsOptional()
  @IsString()
  @Expose()
  ai_model?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Expose()
  warnings?: string[];
}

/**
 * Main DTO for updating receipt data
 */
export class UpdateReceiptDto {


    /**
   * Unique identifier for this extraction
   */
    @IsString()
    @Expose()
    extraction_id: string;
  /**
   * Update receipt date in YYYY-MM-DD format
   */
  @IsOptional()
  @IsDateString({}, { message: 'Date must be in YYYY-MM-DD format' })
  @Expose()
  date?: string;

  /**
   * Update currency code (ISO 4217)
   */
  @IsOptional()
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
  currency?: string;

  /**
   * Update vendor/store name
   */
  @IsOptional()
  @IsString()
  @Expose()
  vendor_name?: string;

  /**
   * Update array of receipt items
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateReceiptItemDto)
  @Expose()
  receipt_items?: UpdateReceiptItemDto[];

  /**
   * Update subtotal amount (before tax)
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
   * Update tax amount
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(({ value }) => value ? Number(Number(value).toFixed(2)) : undefined)
  @Expose()
  tax?: number;

  /**
   * Update tax details (rate, type, etc.)
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateTaxDetailsDto)
  @Expose()
  tax_details?: UpdateTaxDetailsDto;

  /**
   * Update total amount
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(({ value }) => value ? Number(Number(value).toFixed(2)) : undefined)
  @Expose()
  total?: number;

  /**
   * Update payment method
   */
  @IsOptional()
  @IsString()
  @Expose()
  payment_method?: string;

  /**
   * Update receipt number
   */
  @IsOptional()
  @IsString()
  @Expose()
  receipt_number?: string;

  /**
   * Update confidence score (0-1) - typically system managed
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
   * Update extraction metadata (admin/system use)
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateExtractionMetadataDto)
  @Expose()
  extraction_metadata?: UpdateExtractionMetadataDto;
}



/**
 * DTO for updating receipt status
 */
export class UpdateReceiptStatusDto {
  @IsString()
  @IsIn(['success', 'partial', 'failed'])
  @Expose()
  status: 'success' | 'partial' | 'failed';

  @IsOptional()
  @IsString()
  @Expose()
  reason?: string;
}