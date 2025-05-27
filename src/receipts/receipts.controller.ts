import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
  Get,
  HttpStatus,
  HttpCode,
  Logger,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReceiptsService } from './receipts.service';
import { ExtractReceiptDto, ReceiptResponseDto } from './dto';

@Controller('extract-receipt-details')
export class ReceiptsController {
  private readonly logger = new Logger(ReceiptsController.name);

  constructor(private readonly receiptsService: ReceiptsService) {}

  /**
   * Extract receipt data from uploaded image
   * POST /extract-receipt-details
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async extractReceiptDetails(
    @UploadedFile() file: Express.Multer.File,
    @Body() extractOptions: ExtractReceiptDto,
  ): Promise<ReceiptResponseDto> {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded. Please upload a receipt image.',
      );
    }

    this.logger.log(
      `Receipt extraction request received - File: ${file.originalname}, Size: ${file.size} bytes`,
    );

    return await this.receiptsService.extractReceiptData(file, extractOptions);
  }

  /**
   * Get supported currencies
   * GET /extract-receipt-details/currencies
   */
  @Get('currencies')
  getSupportedCurrencies(): { currencies: string[] } {
    return {
      currencies: this.receiptsService.getSupportedCurrencies(),
    };
  }

  /**
   * Get service health and capabilities
   * GET /extract-receipt-details/health
   */
  @Get('health')
  async getServiceHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    capabilities: string[];
    version: string;
  }> {
    return await this.receiptsService.getServiceHealth();
  }

  /**
   * Validate extraction results (future endpoint for manual validation)
   * POST /extract-receipt-details/validate
   */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateExtraction(@Body() data: any): Promise<{
    isValid: boolean;
    warnings: string[];
    suggestions: string[];
  }> {
    return await this.receiptsService.validateExtraction(data);
  }

  /**
   * Get extraction by ID
   * GET /extract-receipt-details/history/:extractionId
   */
  @Get('history/:extractionId')
  async getExtractionById(
    @Param('extractionId') extractionId: string,
  ): Promise<ReceiptResponseDto> {
    this.logger.log(`Extraction history lookup requested - ID: ${extractionId}`);

    const receipt = await this.receiptsService.getExtractionById(extractionId);
    
    if (!receipt) {
      throw new NotFoundException(
        `No extraction found with ID: ${extractionId}`,
      );
    }

    return receipt;
  }

  /**
   * Get all receipts with pagination
   * GET /extract-receipt-details/receipts
   */
  @Get('receipts')
  async getAllReceipts(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{
    receipts: ReceiptResponseDto[];
    pagination: {
      limit: number;
      offset: number;
      total: number;
    };
  }> {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    // Validate pagination parameters
    if (limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }
    if (offsetNum < 0) {
      throw new BadRequestException('Offset must be 0 or greater');
    }

    this.logger.log(`Fetching receipts - Limit: ${limitNum}, Offset: ${offsetNum}`);

    const receipts = await this.receiptsService.getAllReceipts(limitNum, offsetNum);
    
    return {
      receipts,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: receipts.length, // Note: This is the returned count, not total in DB
      },
    };
  }
}
