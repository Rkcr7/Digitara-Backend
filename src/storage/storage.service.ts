import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as sharp from 'sharp';
import { SupabaseService } from '../database/supabase.service';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadDir: string;
  private readonly maxFileSize: number;
  private readonly allowedMimeTypes: string[];
  private readonly storageType: string;

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {
    this.uploadDir = this.configService.get<string>('upload.uploadDir');
    this.maxFileSize = this.configService.get<number>('upload.maxFileSize');
    this.allowedMimeTypes = this.configService.get<string[]>(
      'upload.allowedMimeTypes',
    );
    this.storageType = this.configService.get<string>('storage.type');
  }

  /**
   * Save uploaded image file to storage (Supabase or local with fallback)
   * @param file - Uploaded file
   * @param customId - Optional custom ID, otherwise generates UUID
   * @returns Promise<string> - File URL for access
   */
  async saveImage(
    file: Express.Multer.File,
    customId?: string,
  ): Promise<string> {
    try {
      // Validate file
      this.validateFile(file);

      // Generate unique filename
      const fileId = customId || uuidv4();
      const fileExtension = this.getFileExtension(file.originalname);
      const fileName = `${fileId}${fileExtension}`;

      // Process image buffer
      const processedBuffer = await this.processImageBuffer(file.buffer);

      // Try Supabase storage first, fallback to local
      if (this.storageType === 'supabase') {
        try {
          const supabaseUrl = await this.saveToSupabase(fileName, processedBuffer, file.mimetype);
          this.logger.log(`Image saved to Supabase: ${fileName}`);
          return supabaseUrl;
        } catch (supabaseError) {
          this.logger.warn(`Supabase storage failed, falling back to local: ${supabaseError.message}`);
          // Continue to local storage
        }
      }

      // Local storage (default or fallback)
      await this.ensureUploadDir();
      const localPath = join(this.uploadDir, fileName);
      await fs.writeFile(localPath, processedBuffer);
      this.logger.log(`Image saved locally: ${fileName}`);
      
      return `/storage/images/${fileName}`;

    } catch (error) {
      throw new BadRequestException(`Failed to save image: ${error.message}`);
    }
  }

  /**
   * Save image to Supabase Storage
   * @param fileName - File name
   * @param buffer - Image buffer
   * @param mimetype - File MIME type
   * @returns Promise<string> - Public URL
   */
  private async saveToSupabase(fileName: string, buffer: Buffer, mimetype: string): Promise<string> {
    const bucket = this.supabaseService.getStorageBucket();
    
    // Upload file to Supabase Storage
    const { data, error } = await bucket.upload(fileName, buffer, {
      contentType: mimetype,
      upsert: true, // Replace if exists
    });

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = bucket.getPublicUrl(fileName);
    
    if (!publicUrlData?.publicUrl) {
      throw new Error('Failed to get public URL from Supabase');
    }

    return publicUrlData.publicUrl;
  }

  /**
   * Process image buffer with optimization
   * @param buffer - Original image buffer
   * @returns Promise<Buffer> - Processed image buffer
   */
  private async processImageBuffer(buffer: Buffer): Promise<Buffer> {
    try {
      // Optimize image: resize if too large, convert to JPEG, compress
      return await sharp(buffer)
        .resize(2048, 2048, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({
          quality: 85,
          progressive: true,
        })
        .toBuffer();
    } catch (error) {
      this.logger.warn(`Image processing failed, using original: ${error.message}`);
      // Return original buffer if processing fails
      return buffer;
    }
  }

  /**
   * Get file path for serving
   * @param fileName - Name of the file
   * @returns string - Full file path
   */
  getFilePath(fileName: string): string {
    return join(process.cwd(), this.uploadDir, fileName);
  }

  /**
   * Delete file from storage (both Supabase and local)
   * @param fileName - Name of the file to delete
   * @returns Promise<boolean> - Success status
   */
  async deleteFile(fileName: string): Promise<boolean> {
    let success = false;

    // Try to delete from Supabase if using cloud storage
    if (this.storageType === 'supabase') {
      try {
        const bucket = this.supabaseService.getStorageBucket();
        const { error } = await bucket.remove([fileName]);
        if (!error) {
          this.logger.log(`File deleted from Supabase: ${fileName}`);
          success = true;
        }
      } catch (error) {
        this.logger.warn(`Failed to delete from Supabase: ${error.message}`);
      }
    }

    // Also try to delete from local storage (fallback or primary)
    try {
      const filePath = this.getFilePath(fileName);
      await fs.unlink(filePath);
      this.logger.log(`File deleted locally: ${fileName}`);
      success = true;
    } catch {
      // Local file might not exist, that's okay
    }

    return success;
  }

  /**
   * Check if file exists in storage
   * @param fileName - Name of the file
   * @returns Promise<boolean>
   */
  async fileExists(fileName: string): Promise<boolean> {
    // Check Supabase storage first if using cloud
    if (this.storageType === 'supabase') {
      try {
        const bucket = this.supabaseService.getStorageBucket();
        const { data, error } = await bucket.list('', {
          search: fileName,
          limit: 1,
        });
        
        if (!error && data && data.length > 0) {
          return true;
        }
      } catch (error) {
        this.logger.warn(`Failed to check Supabase file existence: ${error.message}`);
      }
    }

    // Check local storage
    try {
      const filePath = this.getFilePath(fileName);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get storage health status
   * @returns Promise<{ local: boolean; supabase: boolean }>
   */
  async getStorageHealth(): Promise<{ local: boolean; supabase: boolean }> {
    const health = { local: false, supabase: false };

    // Test local storage
    try {
      await this.ensureUploadDir();
      const testFile = join(this.uploadDir, 'test-write.tmp');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      health.local = true;
    } catch (error) {
      this.logger.warn(`Local storage health check failed: ${error.message}`);
    }

    // Test Supabase storage
    if (this.storageType === 'supabase') {
      try {
        const bucket = this.supabaseService.getStorageBucket();
        await bucket.list('', { limit: 1 });
        health.supabase = true;
      } catch (error) {
        this.logger.warn(`Supabase storage health check failed: ${error.message}`);
      }
    }

    return health;
  }

  /**
   * Get file statistics
   * @param fileName - Name of the file
   * @returns Promise<{ size: number; createdAt: Date }>
   */
  async getFileStats(
    fileName: string,
  ): Promise<{ size: number; createdAt: Date }> {
    try {
      const filePath = this.getFilePath(fileName);
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        createdAt: stats.birthtime,
      };
    } catch (error) {
      throw new BadRequestException(`File not found: ${fileName}`);
    }
  }

  /**
   * Validate uploaded file
   */
  private validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `File size exceeds limit of ${this.maxFileSize / 1024 / 1024}MB`,
      );
    }

    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${this.allowedMimeTypes.join(', ')}`,
      );
    }
  }

  /**
   * Ensure upload directory exists
   */
  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '.jpg';
  }

  /**
   * Process and save image with optimization
   */
  private async processAndSaveImage(
    buffer: Buffer,
    filePath: string,
  ): Promise<void> {
    try {
      // Optimize image: resize if too large, convert to JPEG, compress
      await sharp(buffer)
        .resize(2048, 2048, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({
          quality: 85,
          progressive: true,
        })
        .toFile(filePath);
    } catch (error) {
      // Fallback: save original file if sharp processing fails
      await fs.writeFile(filePath, buffer);
    }
  }
}
