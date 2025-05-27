# Receipt Extractor API Documentation

## Base URL
```
http://localhost:3000
```

## Authentication
Currently, no authentication is required. Future versions will include API key authentication.

## Content Types
- **Request**: `multipart/form-data` for file uploads, `application/json` for other requests
- **Response**: `application/json`

---

## Endpoints

### 1. Extract Receipt Data

Extract structured data from a receipt image using AI and automatically save to database.

**Endpoint:** `POST /extract-receipt-details`

**Request Headers:**
```http
Content-Type: multipart/form-data
```

**Request Body (multipart/form-data):**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | ✅ Yes | Receipt image (JPEG, PNG, WebP, max 10MB) |
| `customId` | String | ❌ No | Custom extraction ID (UUID format) |
| `saveImage` | Boolean | ❌ No | Save image to storage (default: true) |
| `includeMetadata` | Boolean | ❌ No | Include processing metadata (default: false) |

**Success Response (200):**
```json
{
  "status": "success" | "partial" | "failed",
  "extraction_id": "550e8400-e29b-41d4-a716-446655440000",
  "date": "2024-01-15",
  "currency": "USD",
  "vendor_name": "Grocery Store Inc.",
  "receipt_items": [
    {
      "item_name": "Milk",
      "item_cost": 3.99,
      "quantity": 1
    },
    {
      "item_name": "Bread",
      "item_cost": 2.50,
      "quantity": 2
    }
  ],
  "subtotal": 8.99,
  "tax": 0.72,
  "total": 9.71,
  "confidence_score": 0.95,
  "image_url": "https://your-project.supabase.co/storage/v1/object/public/receipts/550e8400-e29b-41d4-a716-446655440000.jpg",
  "extracted_at": "2024-01-15T10:30:00.000Z",
  "extraction_metadata": {
    "processing_time": 2500,
    "ai_model": "gemini-2.0-flash",
    "warnings": []
  }
}
```

**Error Response (400):**
```json
{
  "status": "error",
  "error_code": "VALIDATION_ERROR",
  "message": "Invalid file type",
  "extraction_id": "550e8400-e29b-41d4-a716-446655440000",
  "details": ["Supported formats: JPEG, PNG, WebP"],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Status Codes:**
- `200` - Success/Partial/Failed extraction
- `400` - Bad request (validation error)
- `500` - Internal server error

### 2. Get Receipt History by ID 🆕

Retrieve a specific receipt extraction by ID from database.

**Endpoint:** `GET /extract-receipt-details/history/:extractionId`

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `extractionId` | String | ✅ Yes | The extraction ID to retrieve |

**Success Response (200):**
```json
{
  "status": "success",
  "extraction_id": "550e8400-e29b-41d4-a716-446655440000",
  "date": "2024-01-15",
  "currency": "USD",
  "vendor_name": "Grocery Store Inc.",
  "receipt_items": [
    {
      "item_name": "Milk",
      "item_cost": 3.99,
      "quantity": 1,
      "original_name": "Milk 1L"
    }
  ],
  "subtotal": 8.99,
  "tax": 0.72,
  "total": 9.71,
  "payment_method": "Credit Card",
  "receipt_number": "REC-001",
  "confidence_score": 0.95,
  "image_url": "https://your-project.supabase.co/storage/v1/object/public/receipts/550e8400-e29b-41d4-a716-446655440000.jpg",
  "extracted_at": "2024-01-15T10:30:00.000Z",
  "extraction_metadata": {
    "processing_time": 2500,
    "ai_model": "gemini-2.0-flash",
    "warnings": []
  }
}
```

**Error Response (404):**
```json
{
  "statusCode": 404,
  "message": "No extraction found with ID: invalid-id",
  "error": "Not Found"
}
```

**Status Codes:**
- `200` - Receipt found and returned
- `404` - Receipt not found
- `500` - Internal server error

**Example Request:**
```bash
curl -X GET "http://localhost:3000/extract-receipt-details/history/550e8400-e29b-41d4-a716-446655440000"
```

### 3. Get All Receipts (Paginated) 🆕

Retrieve all receipts with pagination support.

**Endpoint:** `GET /extract-receipt-details/receipts`

**Query Parameters:**
| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `limit` | Integer | ❌ No | Number of receipts to return | 1-100, default: 50 |
| `offset` | Integer | ❌ No | Number of receipts to skip | ≥0, default: 0 |

**Success Response (200):**
```json
{
  "receipts": [
    {
      "status": "success",
      "extraction_id": "550e8400-e29b-41d4-a716-446655440000",
      "date": "2024-01-15",
      "currency": "USD",
      "vendor_name": "Grocery Store Inc.",
      "receipt_items": [
        {
          "item_name": "Milk",
          "item_cost": 3.99,
          "quantity": 1
        }
      ],
      "subtotal": 8.99,
      "tax": 0.72,
      "total": 9.71,
      "confidence_score": 0.95,
      "image_url": "https://your-project.supabase.co/storage/v1/object/public/receipts/550e8400-e29b-41d4-a716-446655440000.jpg",
      "extracted_at": "2024-01-15T10:30:00.000Z"
    },
    {
      "status": "success",
      "extraction_id": "another-uuid-here",
      "date": "2024-01-14",
      "vendor_name": "Coffee Shop",
      "total": 4.50,
      "extracted_at": "2024-01-14T14:20:00.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 2
  }
}
```

**Error Response (400):**
```json
{
  "statusCode": 400,
  "message": "Limit must be between 1 and 100",
  "error": "Bad Request"
}
```

**Status Codes:**
- `200` - Receipts retrieved successfully
- `400` - Invalid pagination parameters
- `500` - Internal server error

**Example Requests:**
```bash
# Get first 10 receipts
curl -X GET "http://localhost:3000/extract-receipt-details/receipts?limit=10&offset=0"

# Get next 10 receipts
curl -X GET "http://localhost:3000/extract-receipt-details/receipts?limit=10&offset=10"

# Get default (50 receipts)
curl -X GET "http://localhost:3000/extract-receipt-details/receipts"
```

### 4. Service Health Check

Get service status and capabilities.

**Endpoint:** `GET /extract-receipt-details/health`

**Response (200):**
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "capabilities": [
    "Multi-language receipt processing",
    "Currency detection (12+ currencies)",
    "Image optimization and storage",
    "Mathematical validation",
    "Confidence scoring",
    "Comprehensive error handling",
    "Cloud database persistence",
    "Receipt history retrieval"
  ],
  "version": "1.0.0"
}
```

### 6. Validate Extraction Data

Validate extracted receipt data for mathematical consistency.

**Endpoint:** `POST /extract-receipt-details/validate`

**Request Headers:**
```http
Content-Type: application/json
```

**Request Body:**
```json
{
  "vendor_name": "Grocery Store Inc.",
  "receipt_items": [
    {
      "item_name": "Milk",
      "item_cost": 3.99,
      "quantity": 1
    },
    {
      "item_name": "Bread",
      "item_cost": 2.50,
      "quantity": 2
    }
  ],
  "date": "2024-01-15",
  "currency": "USD",
  "subtotal": 8.99,
  "tax": 0.72,
  "total": 9.71
}
```

**Response (200):**
```json
{
  "isValid": true,
  "warnings": [],
  "suggestions": []
}
```

**Example with validation issues:**
```json
{
  "isValid": false,
  "warnings": [
    "Mathematical inconsistency: Expected total 9.71, but calculated 8.99 + 0.72 = 9.71",
    "Missing vendor name"
  ],
  "suggestions": [
    "Ensure the store/restaurant name is clearly visible in the image",
    "Verify the receipt totals are clearly visible and not damaged"
  ]
}
```

### 7. Retrieve Stored Images

Get previously uploaded receipt images.

**Endpoint:** `GET /storage/images/:filename`

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filename` | String | ✅ Yes | Image filename from extraction response |

**Response:**
- `200` - Image file (JPEG format, optimized)
- `404` - Image not found

**Example:**
```bash
curl -X GET "http://localhost:3000/storage/images/550e8400-e29b-41d4-a716-446655440000.jpg"
```

---

## Database Integration

### Automatic Persistence
All successful extractions are automatically saved to Supabase database with:
- **Graceful Degradation**: Extraction continues even if database save fails
- **Complete Data Storage**: All extracted fields, items, and metadata preserved
- **Unique Identifiers**: Each extraction gets a unique UUID for retrieval
- **Timestamps**: Automatic tracking of extraction and creation times

### Storage Integration
Images are stored with hybrid approach:
- **Primary**: Supabase Storage (cloud CDN)
- **Fallback**: Local filesystem storage
- **URLs**: Full Supabase URLs or local relative paths
- **Optimization**: Automatic resize and compression

---

## Error Codes

| Code | Description | HTTP Status | Example |
|------|-------------|-------------|---------|
| `VALIDATION_ERROR` | File validation failed | 400 | Invalid file type, size exceeded |
| `NOT_A_RECEIPT` | Image is not a receipt | 400 | Photo of person, landscape |
| `NO_ITEMS_FOUND` | No items detected | 400 | Blank receipt, unclear image |
| `AI_SERVICE_UNAVAILABLE` | AI service down | 500 | Network timeout, service down |
| `AI_RESPONSE_ERROR` | Invalid AI response | 500 | Malformed JSON, missing data |
| `CONFIGURATION_ERROR` | Service misconfigured | 500 | Missing API key, invalid settings |

## Data Types

### Receipt Item Object
```typescript
{
  item_name: string;        // Processed/translated item name
  item_cost: number;        // Item price (decimal)
  quantity?: number;        // Item quantity (default: 1)
  original_name?: string;   // Original text from receipt
}
```

### Extraction Status
- `success` - All critical data extracted with high confidence
- `partial` - Some data extracted but with warnings or low confidence
- `failed` - Extraction failed or critical data missing

## Rate Limiting

Currently no rate limiting is implemented. Future versions will include:
- 100 requests per minute per IP
- 1000 requests per hour per IP
- Burst allowance for authenticated users

## File Limits

- **Maximum file size**: 10MB
- **Supported formats**: JPEG, PNG, WebP (all converted to JPEG for storage)
- **Image optimization**: Resized to max 2048x2048, 85% JPEG quality
- **Validation**: File size, MIME type, and extension checking

## Processing Times

- **Average processing time**: 2-4 seconds (varies by image complexity)
- **Timeout**: OpenAI default timeout with exponential backoff
- **Retry attempts**: 3 with exponential backoff (1s, 2s, 4s delays)
- **Database queries**: Sub-second response times with indexed lookups

## Example Workflows

### 1. Complete Receipt Processing
```bash
# 1. Extract receipt data
curl -X POST "http://localhost:3000/extract-receipt-details" \
  -F "file=@receipt.jpg" \
  -F "includeMetadata=true"

# Response includes extraction_id: "550e8400-e29b-41d4-a716-446655440000"

# 2. Later retrieve the same receipt
curl -X GET "http://localhost:3000/extract-receipt-details/history/550e8400-e29b-41d4-a716-446655440000"
```

### 2. Browse Receipt History
```bash
# Get recent receipts
curl -X GET "http://localhost:3000/extract-receipt-details/receipts?limit=20&offset=0"

# Get older receipts
curl -X GET "http://localhost:3000/extract-receipt-details/receipts?limit=20&offset=20"
```

### 3. Validation Workflow
```bash
# Extract receipt
curl -X POST "http://localhost:3000/extract-receipt-details" \
  -F "file=@receipt.jpg"

# Validate the results
curl -X POST "http://localhost:3000/extract-receipt-details/validate" \
  -H "Content-Type: application/json" \
  -d '{"vendor_name": "Store", "total": 10.00, ...}'
