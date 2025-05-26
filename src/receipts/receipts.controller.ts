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
}
