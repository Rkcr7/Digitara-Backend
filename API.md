# Receipt Extractor API Documentation

## Base URL
```
http://localhost:3000
```

## Authentication
Currently, no authentication is required. Future versions will include API key authentication.

## Content Types
- **Request**: `multipart/form-data` for file uploads
- **Response**: `application/json`

---

## Endpoints

### 1. Extract Receipt Data

Extract structured data from a receipt image using AI.

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
  "extraction_id": "uuid-string",
  "date": "YYYY-MM-DD",
  "currency": "USD",
  "vendor_name": "Store Name",
  "receipt_items": [
    {
      "item_name": "Product Name",
      "item_cost": 9.99,
      "quantity": 1
    }
  ],
  "subtotal": 9.99,
  "tax": 0.80,
  "total": 10.79,
  "confidence_score": 0.95,
  "image_url": "/storage/images/extraction-id.jpg",
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
  "extraction_id": "uuid-string",
  "details": ["Supported formats: JPEG, PNG, WebP"],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Status Codes:**
- `200` - Success/Partial/Failed extraction
- `400` - Bad request (validation error)
- `500` - Internal server error

### 2. Service Health Check

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
    "Comprehensive error handling"
  ],
  "version": "1.0.0"
}
```

### 3. Supported Currencies

Get list of supported currency codes.

**Endpoint:** `GET /extract-receipt-details/currencies`

**Response (200):**
```json
[
  "USD", "EUR", "GBP", "CAD", "AUD", "SGD",
  "CHF", "JPY", "CNY", "INR", "NZD", "HKD"
]
```

### 4. Validate Extraction Data

Validate extracted receipt data for mathematical consistency.

**Endpoint:** `POST /extract-receipt-details/validate`

**Request Body:**
```json
{
  "vendor_name": "Store Name",
  "receipt_items": [
    {
      "item_name": "Product",
      "item_cost": 10.00,
      "quantity": 1
    }
  ],
  "date": "2024-01-15",
  "currency": "USD",
  "subtotal": 10.00,
  "tax": 1.00,
  "total": 11.00
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

### 5. Retrieve Stored Images

Get previously uploaded receipt images.

**Endpoint:** `GET /storage/images/:filename`

**Parameters:**
- `filename` - Image filename returned from extraction

**Response:**
- `200` - Image file (JPEG format, optimized)
- `404` - Image not found

---

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `VALIDATION_ERROR` | File validation failed | 400 |
| `NOT_A_RECEIPT` | Image is not a receipt | 400 |
| `NO_ITEMS_FOUND` | No items detected | 400 |
| `AI_SERVICE_UNAVAILABLE` | AI service down | 500 |
| `AI_RESPONSE_ERROR` | Invalid AI response | 500 |
| `CONFIGURATION_ERROR` | Service misconfigured | 500 |

## Rate Limiting

Currently no rate limiting is implemented. Future versions will include:
- 100 requests per minute per IP
- 1000 requests per hour per IP
- Burst allowance for authenticated users

## File Limits

- **Maximum file size**: 10MB
- **Supported formats**: JPEG, PNG, WebP (all converted to JPEG for storage)
- **Image optimization**: Resized to max 2048x2048, 85% JPEG quality
- **Validation**: File size and MIME type only

## Processing Times

- **Average processing time**: 2-4 seconds (varies by complexity)
- **Timeout**: OpenAI default timeout
- **Retry attempts**: 3 with exponential backoff (1s, 2s, 4s delays)
