import { Module, Global } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [SupabaseService, DatabaseService],
  exports: [SupabaseService, DatabaseService],
})
export class DatabaseModule {}
