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

  // Check mathematical consistency based on tax type
  if (
    data.subtotal !== undefined &&
    data.tax !== undefined &&
    data.total !== undefined
  ) {
    const subtotal = Number(data.subtotal);
    const tax = Number(data.tax);
    const total = Number(data.total);
    const tolerance = 0.01;

    // Check if tax_details exists and has tax_inclusive flag
    const isTaxInclusive = data.tax_details?.tax_inclusive === true;

    if (isTaxInclusive) {
      // For tax-inclusive receipts, the tax is already part of the total
      // So subtotal should be approximately: total - tax
      const expectedSubtotal = total - tax;
      const subtotalDifference = Math.abs(expectedSubtotal - subtotal);

      if (subtotalDifference > tolerance) {
        // Check if the receipt might have items totaling to the full amount (common in inclusive receipts)
        const itemsTotal =
          data.receipt_items?.reduce(
            (sum: number, item: any) =>
              sum + (item.item_cost || 0) * (item.quantity || 1),
            0,
          ) || 0;

        // If items total matches the total (not subtotal), it's a common tax-inclusive pattern
        if (Math.abs(itemsTotal - total) <= tolerance) {
          // This is expected for tax-inclusive receipts, no warning needed
        } else {
          warnings.push(
            `Tax-inclusive receipt validation: Expected subtotal of ${expectedSubtotal.toFixed(
              2,
            )} (total ${total} - tax ${tax}), but found ${subtotal}`,
          );
        }
      }
    } else {
      // For tax-exclusive receipts, subtotal + tax should equal total
      const calculatedTotal = subtotal + tax;
      const totalDifference = Math.abs(calculatedTotal - total);

      if (totalDifference > tolerance) {
        warnings.push(
          `Mathematical inconsistency: subtotal (${subtotal}) + tax (${tax}) = ${calculatedTotal.toFixed(
            2,
          )}, but total is ${total}`,
        );
      }
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
