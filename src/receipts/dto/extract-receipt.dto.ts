import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class ExtractReceiptDto {
  /**
   * Optional custom ID for the receipt (for tracking purposes)
   * If not provided, a UUID will be generated
   */
  @IsOptional()
  @IsString({ message: 'Custom ID must be a string' })
  customId?: string;

  /**
   * Whether to save the original image file
   * Default: true
   */
  @IsOptional()
  @IsBoolean({ message: 'Save image flag must be a boolean' })
  saveImage?: boolean = true;

  /**
   * Whether to include detailed extraction metadata in response
   * Default: false (for cleaner response)
   */
  @IsOptional()
  @IsBoolean({ message: 'Include metadata flag must be a boolean' })
  includeMetadata?: boolean = false;

  /**
   * Language hint for receipt (optional)
   * Can help with better extraction for non-English receipts
   */
  @IsOptional()
  @IsString({ message: 'Language hint must be a string' })
  languageHint?: string;
}
