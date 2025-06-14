import { Module } from '@nestjs/common';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { ReceiptsValidationService } from './receipts.validation.service';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [AiModule, StorageModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptsValidationService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
