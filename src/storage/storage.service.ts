import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as sharp from 'sharp';

@Injectable()
export class StorageService {
  private readonly uploadDir: string;
  private readonly maxFileSize: number;
  private readonly allowedMimeTypes: string[];

  constructor(private configService: ConfigService) {
    this.uploadDir = this.configService.get<string>('upload.uploadDir');
    this.maxFileSize = this.configService.get<number>('upload.maxFileSize');
    this.allowedMimeTypes = this.configService.get<string[]>(
      'upload.allowedMimeTypes',
    );
  }

  /**
   * Save uploaded image file to storage
   * @param file - Uploaded file
   * @param customId - Optional custom ID, otherwise generates UUID
   * @returns Promise<string> - File path relative to upload directory
   */
  async saveImage(
    file: Express.Multer.File,
    customId?: string,
  ): Promise<string> {
    try {
      // Validate file
      this.validateFile(file);

      // Ensure upload directory exists
      await this.ensureUploadDir();

      // Generate unique filename
      const fileId = customId || uuidv4();
      const fileExtension = this.getFileExtension(file.originalname);
      const fileName = `${fileId}${fileExtension}`;
      const filePath = join(this.uploadDir, fileName);

      // Process and save image
      await this.processAndSaveImage(file.buffer, filePath);

      return fileName;
    } catch (error) {
      throw new BadRequestException(`Failed to save image: ${error.message}`);
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
   * Check if file exists
   * @param fileName - Name of the file
   * @returns Promise<boolean>
   */
  async fileExists(fileName: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(fileName);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete file from storage
   * @param fileName - Name of the file to delete
   * @returns Promise<boolean> - Success status
   */
  async deleteFile(fileName: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(fileName);
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
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
