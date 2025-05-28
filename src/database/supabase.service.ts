import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('supabase.url');
    const supabaseServiceKey = this.configService.get<string>('supabase.serviceKey');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration is missing');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.logger.log('Supabase client initialized');
  }

  /**
   * Get Supabase client instance
   */
  getClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('receipts')
        .select('count')
        .limit(1);

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "relation does not exist" which is fine for testing connection
        this.logger.error('Database connection test failed:', error);
        return false;
      }

      this.logger.log('Database connection test successful');
      return true;
    } catch (error) {
      this.logger.error('Database connection test failed:', error);
      return false;
    }
  }

  /**
   * Get storage bucket for receipts
   */
  getStorageBucket() {
    const bucketName = this.configService.get<string>('supabase.storageBucket');
    return this.supabase.storage.from(bucketName);
  }

  /**
   * Ensure storage bucket exists and is properly configured
   */
  async ensureStorageBucket(): Promise<boolean> {
    try {
      const bucketName = this.configService.get<string>('supabase.storageBucket');
      
      // Check if bucket exists
      const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();
      
      if (listError) {
        this.logger.error('Failed to list storage buckets:', listError);
        return false;
      }

      const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
      
      if (!bucketExists) {
        this.logger.log(`Creating storage bucket: ${bucketName}`);
        
        // Create bucket with public access
        const { error: createError } = await this.supabase.storage.createBucket(bucketName, {
          public: true,
          allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png'],
          fileSizeLimit: 10485760, // 10MB
        });

        if (createError) {
          this.logger.error('Failed to create storage bucket:', createError);
          return false;
        }

        this.logger.log(`Storage bucket created successfully: ${bucketName}`);
      } else {
        // Check if bucket is public
        const bucket = buckets.find(b => b.name === bucketName);
        if (!bucket?.public) {
          this.logger.warn(`Storage bucket ${bucketName} exists but is not public. Please make it public in Supabase dashboard.`);
          // Note: We can't update bucket privacy via API, it needs to be done in dashboard
        }
        this.logger.log(`Storage bucket verified: ${bucketName}`);
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to ensure storage bucket:', error);
      return false;
    }
  }

}
