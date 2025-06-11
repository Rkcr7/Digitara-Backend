import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

export interface SaveReceiptData {
  extraction_id: string;
  date?: string;
  currency: string;
  vendor_name: string;
  subtotal?: number;
  tax: number;
  total: number;
  payment_method?: string;
  receipt_number?: string;
  is_valid?: boolean;
  confidence_score?: number;
  image_url?: string;
  status: 'success' | 'partial' | 'failed';
  receipt_items: {
    item_name: string;
    item_cost: number;
    quantity?: number;
    original_name?: string;
  }[];
  extraction_metadata?: {
    processing_time: number;
    ai_model: string;
    warnings?: string[];
  };
}

export interface SavedReceiptData {
  id: string;
  extraction_id: string;
  date?: string;
  currency: string;
  vendor_name: string;
  subtotal?: number;
  tax: number;
  total: number;
  payment_method?: string;
  receipt_number?: string;
  confidence_score?: number;
  is_valid?: boolean;
  image_url?: string;
  status: string;
  extracted_at: string;
  created_at: string;
  receipt_items: {
    id: string;
    item_name: string;
    item_cost: number;
    quantity?: number;
    original_name?: string;
  }[];
  extraction_metadata?: {
    processing_time: number;
    ai_model: string;
    warnings?: string[];
  };
}

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Save receipt data to database
   * @param data - Receipt data to save
   * @returns Promise<SavedReceiptData>
   */
  async saveReceipt(data: SaveReceiptData): Promise<SavedReceiptData> {
    const supabase = this.supabaseService.getClient();
    
    try {
      this.logger.log(`Saving receipt data for extraction ID: ${data.extraction_id}`);

      // Insert main receipt record
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          extraction_id: data.extraction_id,
          date: data.date || null,
          currency: data.currency,
          vendor_name: data.vendor_name,
          subtotal: data.subtotal || null,
          tax: data.tax,
          total: data.total,
          is_valid: data.is_valid,
          payment_method: data.payment_method || null,
          receipt_number: data.receipt_number || null,
          confidence_score: data.confidence_score || null,
          image_url: data.image_url || null,
          status: data.status,
        })
        .select()
        .single();

      if (receiptError) {
        this.logger.error('Failed to insert receipt:', receiptError);
        throw new Error(`Failed to save receipt: ${receiptError.message}`);
      }

      const receiptId = receiptData.id;

      // Insert receipt items
      const itemsToInsert = data.receipt_items.map(item => ({
        receipt_id: receiptId,
        item_name: item.item_name,
        item_cost: item.item_cost,
        quantity: item.quantity || 1,
        original_name: item.original_name || null,
      }));

      const { data: itemsData, error: itemsError } = await supabase
        .from('receipt_items')
        .insert(itemsToInsert)
        .select();

      if (itemsError) {
        this.logger.error('Failed to insert receipt items:', itemsError);
        // Rollback receipt if items insertion fails
        await supabase.from('receipts').delete().eq('id', receiptId);
        throw new Error(`Failed to save receipt items: ${itemsError.message}`);
      }

      // Insert extraction metadata if provided
      let metadataData = null;
      if (data.extraction_metadata) {
        const { data: metadata, error: metadataError } = await supabase
          .from('extraction_metadata')
          .insert({
            receipt_id: receiptId,
            processing_time: data.extraction_metadata.processing_time,
            ai_model: data.extraction_metadata.ai_model,
            warnings: data.extraction_metadata.warnings || [],
          })
          .select()
          .single();

        if (metadataError) {
          this.logger.warn('Failed to insert extraction metadata:', metadataError);
          // Don't fail the entire operation for metadata
        } else {
          metadataData = metadata;
        }
      }

      const savedData: SavedReceiptData = {
        id: receiptData.id,
        extraction_id: receiptData.extraction_id,
        date: receiptData.date,
        currency: receiptData.currency,
        vendor_name: receiptData.vendor_name,
        subtotal: receiptData.subtotal,
        tax: receiptData.tax,
        total: receiptData.total,
        payment_method: receiptData.payment_method,
        receipt_number: receiptData.receipt_number,
        confidence_score: receiptData.confidence_score,
        image_url: receiptData.image_url,
        status: receiptData.status,
        is_valid: receiptData.is_valid,
        extracted_at: receiptData.extracted_at,
        created_at: receiptData.created_at,
        receipt_items: itemsData.map(item => ({
          id: item.id,
          item_name: item.item_name,
          item_cost: item.item_cost,
          quantity: item.quantity,
          original_name: item.original_name,
        })),
        extraction_metadata: metadataData ? {
          processing_time: metadataData.processing_time,
          ai_model: metadataData.ai_model,
          warnings: metadataData.warnings,
        } : undefined,
      };

      this.logger.log(`Receipt saved successfully with ID: ${receiptId}`);
      return savedData;

    } catch (error) {
      this.logger.error(`Failed to save receipt: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get receipt by extraction ID
   * @param extractionId - Extraction ID to lookup
   * @returns Promise<SavedReceiptData | null>
   */
  async getReceiptByExtractionId(extractionId: string): Promise<SavedReceiptData | null> {
    const supabase = this.supabaseService.getClient();

    try {
      this.logger.log(`Looking up receipt by extraction ID: ${extractionId}`);

      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .select(`
          *,
          receipt_items (*),
          extraction_metadata (*)
        `)
        .eq('extraction_id', extractionId)
        .single();

      if (receiptError) {
        if (receiptError.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        this.logger.error('Failed to fetch receipt:', receiptError);
        throw new Error(`Failed to fetch receipt: ${receiptError.message}`);
      }

      return this.mapToSavedReceiptData(receiptData);

    } catch (error) {
      this.logger.error(`Failed to get receipt by extraction ID: ${error.message}`);
      if (error.message.includes('Failed to fetch receipt')) {
        throw error;
      }
      return null;
    }
  }

  /**
   * Get receipt by database ID
   * @param id - Database ID to lookup
   * @returns Promise<SavedReceiptData | null>
   */
  async getReceiptById(id: string): Promise<SavedReceiptData | null> {
    const supabase = this.supabaseService.getClient();

    try {
      this.logger.log(`Looking up receipt by ID: ${id}`);

      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .select(`
          *,
          receipt_items (*),
          extraction_metadata (*)
        `)
        .eq('id', id)
        .single();

      if (receiptError) {
        if (receiptError.code === 'PGRST116') {
          return null;
        }
        this.logger.error('Failed to fetch receipt:', receiptError);
        throw new Error(`Failed to fetch receipt: ${receiptError.message}`);
      }

      return this.mapToSavedReceiptData(receiptData);

    } catch (error) {
      this.logger.error(`Failed to get receipt by ID: ${error.message}`);
      if (error.message.includes('Failed to fetch receipt')) {
        throw error;
      }
      return null;
    }
  }

  /**
   * Get all receipts with pagination
   * @param limit - Number of receipts to return (default: 50)
   * @param offset - Number of receipts to skip (default: 0)
   * @returns Promise<SavedReceiptData[]>
   */
  async getAllReceipts(limit: number = 50, offset: number = 0): Promise<SavedReceiptData[]> {
    const supabase = this.supabaseService.getClient();

    try {
      this.logger.log(`Fetching ${limit} receipts with offset ${offset}`);

      const { data: receiptsData, error: receiptsError } = await supabase
        .from('receipts')
        .select(`
          *,
          receipt_items (*),
          extraction_metadata (*)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (receiptsError) {
        this.logger.error('Failed to fetch receipts:', receiptsError);
        throw new Error(`Failed to fetch receipts: ${receiptsError.message}`);
      }

      return receiptsData.map(receipt => this.mapToSavedReceiptData(receipt));

    } catch (error) {
      this.logger.error(`Failed to get all receipts: ${error.message}`);
      throw error;
    }
  }

  /**
   * Map database response to SavedReceiptData format
   * @param data - Raw database response
   * @returns SavedReceiptData
   */
  private mapToSavedReceiptData(data: any): SavedReceiptData {
    return {
      id: data.id,
      extraction_id: data.extraction_id,
      date: data.date,
      currency: data.currency,
      vendor_name: data.vendor_name,
      subtotal: data.subtotal,
      tax: data.tax,
      total: data.total,
      payment_method: data.payment_method,
      receipt_number: data.receipt_number,
      confidence_score: data.confidence_score,
      image_url: data.image_url,
      status: data.status,
      extracted_at: data.extracted_at,
      created_at: data.created_at,
      receipt_items: (data.receipt_items || []).map((item: any) => ({
        id: item.id,
        item_name: item.item_name,
        item_cost: item.item_cost,
        quantity: item.quantity,
        original_name: item.original_name,
      })),
      extraction_metadata: data.extraction_metadata?.[0] ? {
        processing_time: data.extraction_metadata[0].processing_time,
        ai_model: data.extraction_metadata[0].ai_model,
        warnings: data.extraction_metadata[0].warnings,
      } : undefined,
    };
  }

  /**
   * Test database connection and operations
   * @returns Promise<boolean>
   */
  async testDatabaseOperations(): Promise<boolean> {
    try {
      const connectionTest = await this.supabaseService.testConnection();
      if (!connectionTest) {
        return false;
      }

      // Test a simple query to verify table access
      const supabase = this.supabaseService.getClient();
      const { error } = await supabase
        .from('receipts')
        .select('id')
        .limit(1);

      if (error && error.code !== 'PGRST116') {
        this.logger.error('Database operations test failed:', error);
        return false;
      }

      this.logger.log('Database operations test successful');
      return true;

    } catch (error) {
      this.logger.error('Database operations test failed:', error);
      return false;
    }
  }
}
