# Receipt Extractor Backend

<div align="center">
  <img src="public/logo.png" alt="Receipt Extractor Logo" width="200" height="200">
  
  [![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Gemini 2.0](https://img.shields.io/badge/Gemini_2.0_Flash-4285F4?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)
  [![Jest](https://img.shields.io/badge/Jest-C21325?style=flat&logo=jest&logoColor=white)](https://jestjs.io/)
  
  **AI-Powered Receipt Processing API**
  
  *Transform receipt images into structured data with advanced AI extraction*
</div>

## 🎯 Overview

The Receipt Extractor Backend is a robust NestJS-based API service that automatically extracts structured data from receipt images using Google's Gemini 2.0 Flash AI model. Upload a receipt image and get back detailed information including vendor details, itemized purchases, tax calculations, and totals in JSON & text format or print in structured form.

## ✨ Key Features

### 🧠 **AI-Powered Extraction**
- **Multi-language Support**: Processes receipts in multiple languages, translates item names to English
- **12+ Currency Support**: USD, EUR, GBP, CAD, AUD, SGD, CHF, JPY, CNY, INR, NZD, HKD
- **Smart Data Validation**: Mathematical consistency checks and data verification
- **Confidence Scoring**: Returns confidence levels for extracted data quality

### 🔧 **Robust Processing**
- **File Validation**: Supports JPEG, PNG, WebP formats with size limits
- **Image Optimization**: Automatic resize (max 2048px), JPEG conversion (85% quality), using Sharp
- **Retry Mechanism**: Exponential backoff for reliable AI service calls
- **Error Handling**: Comprehensive error categorization and user-friendly messages

### 📊 **Advanced Features**
- **Tax Detection**: Automatically detects tax-inclusive vs tax-exclusive receipts
- **Item Extraction**: Detailed item-by-item breakdown with quantities and costs
- **Receipt Classification**: Detects and rejects non-receipt images (photos, documents, etc.)
- **Status Tracking**: Success, partial, and failed extraction states

### 🛡️ **Production Ready**
- **Comprehensive Testing**: 25 unit tests covering all scenarios
- **Type Safety**: Full TypeScript implementation with strict validation
- **Security**: Input validation, file type checking, and error sanitization
- **Performance**: Optimized processing with configurable timeouts

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Gemini API key from Google AI Studio

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd receipt-extractor-backend-ai-engineer-Rkcr7
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   ```
   
   Configure your `.env` file:
   ```env
   # Gemini AI Configuration
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
   
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   
   # CORS Configuration
   CORS_ORIGIN=http://localhost:5173
   ```

4. **Start the server**
   ```bash
   # Development mode
   npm run start:dev
   
   # Production mode
   npm run build
   npm run start:prod
   ```

5. **Verify installation**
   ```bash
   curl http://localhost:3000/extract-receipt-details/health
   ```

## 📡 API Documentation

### Core Endpoints

#### `POST /extract-receipt-details`
Extract data from a receipt image.

**Request:**
- **Content-Type**: `multipart/form-data`
- **Body**: 
  - `file` (required): Receipt image file (JPEG, PNG, WebP, max 10MB)
  - `customId` (optional): Custom extraction ID
  - `saveImage` (optional): Save image to storage (default: true)
  - `includeMetadata` (optional): Include processing metadata (default: false)

**Response Example:**
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
  "image_url": "/storage/images/550e8400-e29b-41d4-a716-446655440000.jpg",
  "extracted_at": "2024-01-15T10:30:00.000Z"
}
```

#### `GET /extract-receipt-details/health`
Service health check and capabilities.

**Response:**
```json
{
  "status": "healthy",
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

#### `GET /extract-receipt-details/currencies`
Get list of supported currencies.

**Response:**
```json
[
  "USD", "EUR", "GBP", "CAD", "AUD", "SGD", 
  "CHF", "JPY", "CNY", "INR", "NZD", "HKD"
]
```

#### `POST /extract-receipt-details/validate`
Validate extracted receipt data for consistency.

**Request Body:**
```json
{
  "vendor_name": "Store Name",
  "receipt_items": [...],
  "subtotal": 10.00,
  "tax": 1.00,
  "total": 11.00,
  "currency": "USD"
}
```

#### `GET /storage/images/:filename`
Retrieve stored receipt images.

### Image Storage

Uploaded images are automatically:
- Validated for type and size (max 10MB, JPEG/PNG/WebP)
- Optimized using Sharp (resize to max 2048x2048, JPEG 85% quality, progressive)
- Saved with unique identifiers (UUID-based filenames)
- Served via static endpoints with cache headers

## 🚨 Error Handling

The API provides comprehensive error handling with categorized error codes:

### Error Categories

| Error Code | Description | Example |
|------------|-------------|---------|
| `VALIDATION_ERROR` | File validation failures | Invalid file type, size exceeded |
| `NOT_A_RECEIPT` | Image is not a receipt | Photo of a person, landscape, etc. |
| `NO_ITEMS_FOUND` | No items detected on receipt | Blank receipt, unclear image |
| `AI_SERVICE_UNAVAILABLE` | AI service connectivity issues | Network timeout, service down |
| `AI_RESPONSE_ERROR` | Invalid AI response | Malformed JSON, missing data |
| `CONFIGURATION_ERROR` | Service configuration issues | Missing API key, invalid settings |

### Error Response Format

```json
{
  "status": "error",
  "error_code": "NOT_A_RECEIPT",
  "message": "This image does not appear to be a receipt",
  "extraction_id": "550e8400-e29b-41d4-a716-446655440000",
  "details": [
    "Please upload an image of a receipt or invoice",
    "Processing time: 1250ms"
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test receipts.service.spec

# Run tests in watch mode
npm run test:watch
```

### Test Coverage

**Total Tests**: 25 ✅ **All Passing**

#### Required Test Scenarios ✅
1. **Successful extraction** from valid image
2. **Incorrect file types** (PDF, GIF, text files, MIME mismatches)
3. **Invalid AI responses** (empty, malformed, invalid types, NOT_A_RECEIPT)
4. **500 status responses** (network errors, timeouts, server errors, rate limits)

#### Additional Test Coverage
- UUID generation and custom ID handling
- Image saving options and failure handling
- Data quality assessment and status determination
- Service utility functions (currencies, health, validation)
- Mathematical consistency validation

### Test Architecture

- **Mocking Strategy**: AI and Storage services fully mocked
- **Error Scenarios**: Comprehensive edge case coverage  
- **Data Validation**: Type coercion and transformation testing
- **Integration Testing**: End-to-end flow verification

## 🏗️ Architecture

### Project Structure

```
src/
├── receipts/           # Main receipt processing module
│   ├── dto/           # Data Transfer Objects & validation
│   ├── entities/      # Receipt entities
│   ├── receipts.controller.ts
│   ├── receipts.service.ts
│   └── receipts.service.spec.ts
├── ai/                # AI service integration
│   ├── ai.service.ts
│   ├── ai.module.ts
│   └── ai.service.spec.ts
├── storage/           # File storage management
│   ├── storage.service.ts
│   ├── storage.controller.ts
│   └── storage.module.ts
├── config/            # Configuration management
│   └── configuration.ts
└── main.ts           # Application entry point
```

### Technology Stack

- **Framework**: NestJS with Express
- **Language**: TypeScript with strict type checking
- **AI Integration**: Google Gemini 2.0 Flash via OpenAI-compatible API
- **Image Processing**: Sharp for optimization
- **Validation**: class-validator and class-transformer
- **Testing**: Jest with comprehensive mocking
- **Documentation**: OpenAPI/Swagger (future enhancement)

### Data Flow

1. **Image Upload** → File validation and optimization
2. **AI Processing** → Gemini 2.0 Flash extraction with retry logic
3. **Data Validation** → Mathematical consistency and type checking
4. **Status Assessment** → Success/partial/failed determination
5. **Response Formation** → Structured JSON with metadata

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | - | ✅ |
| `GEMINI_BASE_URL` | Gemini API base URL | Google's endpoint | ❌ |
| `PORT` | Server port | 3000 | ❌ |
| `NODE_ENV` | Environment mode | development | ❌ |
| `CORS_ORIGIN` | CORS allowed origins | http://localhost:5173 | ❌ |

### File Upload Limits

- **Max File Size**: 10MB
- **Supported Formats**: JPEG, PNG, WebP (all converted to JPEG for storage)
- **Validation**: MIME type and extension checking
- **Storage**: Local filesystem with UUID-based unique naming

## 📈 Performance & Monitoring

### Processing Metrics
- **Average Processing Time**: 2-4 seconds per receipt (varies by image complexity)
- **AI Service Timeout**: OpenAI default timeout with exponential backoff
- **Confidence Thresholds**: 80% for inconsistent data, 95% for validated receipts
- **Retry Logic**: 3 attempts with 1s, 2s, 4s delays (exponential backoff)

### Monitoring Endpoints
- Health check at `/extract-receipt-details/health`
- Service capabilities and version information
- Processing time tracking in response metadata
