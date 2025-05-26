import { BadRequestException } from '@nestjs/common';

/**
 * Validate uploaded receipt file
 * @param file - Uploaded file object
 * @throws BadRequestException if file is invalid
 */
export function validateReceiptFile(file: Express.Multer.File): void {
  if (!file) {
    throw new BadRequestException(
      'No file uploaded. Please upload a receipt image.',
    );
  }

  // Check file size (10MB limit)
  const maxSizeInBytes = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSizeInBytes) {
    throw new BadRequestException(
      `File size exceeds limit. Maximum size allowed is ${maxSizeInBytes / 1024 / 1024}MB, received ${(file.size / 1024 / 1024).toFixed(2)}MB.`,
    );
  }

  // Check MIME type
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new BadRequestException(
      `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}. Received: ${file.mimetype}`,
    );
  }

  // Check if file has content
  if (file.size === 0) {
    throw new BadRequestException(
      'Uploaded file is empty. Please upload a valid receipt image.',
    );
  }

  // Validate file extension
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const fileExtension = getFileExtension(file.originalname);

  if (!allowedExtensions.includes(fileExtension.toLowerCase())) {
    throw new BadRequestException(
      `Invalid file extension. Allowed extensions: ${allowedExtensions.join(', ')}. Received: ${fileExtension}`,
    );
  }
}

/**
 * Extract file extension from filename
 * @param filename - Original filename
 * @returns File extension with dot (e.g., '.jpg')
 */
function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '';
}

/**
 * Generate error details for validation failures
 * @param errors - Array of validation error messages
 * @returns Formatted error details object
 */
export function formatValidationErrors(errors: string[]): {
  error_code: string;
  message: string;
  details: string[];
} {
  return {
    error_code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    details: errors,
  };
}

/**
 * Check if currency code is supported
 * @param currency - Currency code to validate
 * @returns boolean indicating if currency is supported
 */
export function isSupportedCurrency(currency: string): boolean {
  const supportedCurrencies = [
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

  return supportedCurrencies.includes(currency.toUpperCase());
}

/**
 * Validate extraction response data consistency
 * @param data - Extracted receipt data
 * @returns Array of validation warnings
 */
export function validateExtractionConsistency(data: any): string[] {
  const warnings: string[] = [];

  // Check mathematical consistency
  if (data.subtotal && data.tax && data.total) {
    const calculatedTotal = Number(data.subtotal) + Number(data.tax);
    const actualTotal = Number(data.total);
    const tolerance = 0.01;

    if (Math.abs(calculatedTotal - actualTotal) > tolerance) {
      warnings.push(
        `Mathematical inconsistency: subtotal (${data.subtotal}) + tax (${data.tax}) = ${calculatedTotal.toFixed(2)}, but total is ${actualTotal.toFixed(2)}`,
      );
    }
  }

  // Check for missing critical data
  if (!data.vendor_name) {
    warnings.push('Vendor name could not be extracted');
  }

  if (!data.receipt_items || data.receipt_items.length === 0) {
    warnings.push('No receipt items could be extracted');
  }

  if (!data.date) {
    warnings.push('Receipt date could not be determined');
  }

  // Check currency validity
  if (data.currency && !isSupportedCurrency(data.currency)) {
    warnings.push(`Unsupported currency detected: ${data.currency}`);
  }

  return warnings;
}
