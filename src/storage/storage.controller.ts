import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { StorageService } from './storage.service';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * Serve static files
   */
  @Get('images/:filename')
  async serveImage(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const exists = await this.storageService.fileExists(filename);
      if (!exists) {
        throw new NotFoundException(`Image not found: ${filename}`);
      }

      const filePath = this.storageService.getFilePath(filename);
      
      // Set proper headers for images
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.setHeader('Content-Type', 'image/jpeg'); // Adjust based on file type if needed
      
      return res.sendFile(filePath, (err) => {
        if (err) {
          console.error(`Error serving image ${filename}:`, err);
          if (!res.headersSent) {
            res.status(404).json({ message: 'Image not found' });
          }
        }
      });
    } catch (error) {
      console.error(`Error in serveImage for ${filename}:`, error);
      if (!res.headersSent) {
        res.status(404).json({ message: 'Image not found' });
      }
    }
  }

  /**
   * Test endpoint for file upload (for testing storage service)
   */
  @Post('test-upload')
  @UseInterceptors(FileInterceptor('file'))
  async testUpload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const fileName = await this.storageService.saveImage(file);
    const stats = await this.storageService.getFileStats(fileName);

    return {
      message: 'File uploaded successfully',
      fileName,
      originalName: file.originalname,
      size: stats.size,
      uploadedAt: stats.createdAt,
      url: `/storage/images/${fileName}`,
    };
  }

  /**
   * Get file information
   */
  @Get('info/:filename')
  async getFileInfo(@Param('filename') filename: string) {
    const exists = await this.storageService.fileExists(filename);
    if (!exists) {
      throw new NotFoundException('File not found');
    }

    const stats = await this.storageService.getFileStats(filename);
    return {
      fileName: filename,
      size: stats.size,
      createdAt: stats.createdAt,
      url: `/storage/images/${filename}`,
    };
  }
}
