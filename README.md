# Digitara Backend

> This is the backend API for the **Digitara** application, which is live at [**https://digitara.cloud**](https://digitara.cloud).

<div align="center">
  <img src="public/logo.png" alt="Digitara Logo" width="200" height="200">
  
  [![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Gemini 2.0](https://img.shields.io/badge/Gemini_2.0_Flash-4285F4?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)
  [![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)
  [![Jest](https://img.shields.io/badge/Jest-C21325?style=flat&logo=jest&logoColor=white)](https://jestjs.io/)
  
  **Intelligent Document Processing API with Cloud Storage & Database**
  
  *Transform receipt images into structured data with enterprise-grade AI intelligence, automatic persistence, and secure cloud storage*
</div>

## 🎯 Overview

The Digitara Backend is a robust NestJS-based API service that automatically extracts structured data from receipt images using Google's Gemini 2.0 Flash AI model. Upload a receipt image and get back detailed information including vendor details, itemized purchases, tax calculations, and totals in JSON format. All extractions are automatically saved to the cloud database with receipt history retrieval capabilities.

## ✨ Key Features

### 🧠 **AI-Powered Extraction**
- **Multi-language Support**: Processes receipts in multiple languages, translates item names to English
- **Multiple Currency Support**: USD, EUR, GBP, CAD, AUD, SGD, CHF, JPY, CNY, INR, NZD, HKD
- **Smart Data Validation**: Mathematical consistency checks and data verification
- **Confidence Scoring**: Provides proper confidence levels (e.g., 0.95 for high quality, 0.80 for mathematical inconsistencies, 0.70 for poor image quality where essential data like total is still extracted, and 0.50 for very poor image quality where critical data like total is unextractable). Image quality assessment directly influences this score and generates specific warnings.

### 🗄️ **Database Integration & Cloud Storage**
- **Supabase Integration**: Automatic receipt data persistence to cloud database
- **Receipt History**: Retrieve past extractions by ID with full data preservation
- **Cloud Storage**: Images stored in Supabase Storage with automatic fallback to local storage
- **Paginated Retrieval**: Browse all receipts with pagination support

### 🔧 **Robust Processing**
- **File Validation**: Supports JPEG, PNG, WebP formats with size limits
- **Image Optimization**: Automatic resize (max 2048px), JPEG conversion (85% quality), using Sharp
- **Retry Mechanism**: Exponential backoff for reliable AI service calls
- **Error Handling**: Comprehensive error categorization and user-friendly messages
- **Rate Limiting**: IP-based rate limiting to protect against brute-force attacks (10 requests/minute).

### 📊 **Advanced Features**
- **Tax Detection**: Automatically detects tax-inclusive vs tax-exclusive receipts
- **Item Extraction**: Detailed item-by-item breakdown with quantities and costs
- **Receipt Classification**: Detects and rejects non-receipt images (photos, documents, etc.)
- **Status Tracking**: Success, partial, and failed extraction states
- **Data Persistence**: Graceful degradation - extraction continues even if database save fails

### 🛡️ **Production Ready**
- **Comprehensive Testing**: 28+ unit tests covering all scenarios including Supabase integration
- **Type Safety**: Full TypeScript implementation with strict validation
- **Security**: Input validation, file type checking, and error sanitization
- **Performance**: Optimized processing with configurable timeouts
- **Scalability**: Cloud-native with Supabase backend infrastructure

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Gemini API key from Google AI Studio
- Supabase project (for database and storage)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Rkcr7/Digitara-Backend.git
   cd digitara-backend
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
   # AI Configuration
   GEMINI_API_KEY=your_gemini_api_key_here
   
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   
   # File Upload Configuration
   MAX_FILE_SIZE=10485760
   UPLOAD_DIR=uploads
   
   # CORS Configuration
   FRONTEND_URL=http://localhost:5173
   
   # Supabase Configuration
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_KEY=your_service_key
   SUPABASE_STORAGE_BUCKET=receipts
   
   # Storage Configuration
   STORAGE_TYPE=supabase
   ```

4. **Supabase Setup**
   
   Create the following tables in your Supabase project:
   
   ```sql
   -- Receipts table
   CREATE TABLE receipts (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     extraction_id VARCHAR NOT NULL UNIQUE,
     date DATE,
     currency VARCHAR(3) NOT NULL DEFAULT 'USD',
     vendor_name VARCHAR NOT NULL,
     subtotal DECIMAL(10,2),
     tax DECIMAL(10,2) NOT NULL DEFAULT 0,
     total DECIMAL(10,2) NOT NULL,
     payment_method VARCHAR,
     receipt_number VARCHAR,
     confidence_score DECIMAL(3,2),
     image_url TEXT,
     status VARCHAR NOT NULL DEFAULT 'success',
     extracted_at TIMESTAMPTZ DEFAULT NOW(),
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- Receipt items table
   CREATE TABLE receipt_items (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     receipt_id UUID REFERENCES receipts(id) ON DELETE CASCADE,
     item_name VARCHAR NOT NULL,
     item_cost DECIMAL(10,2) NOT NULL,
     quantity INTEGER DEFAULT 1,
     original_name VARCHAR,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- Extraction metadata table
   CREATE TABLE extraction_metadata (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     receipt_id UUID REFERENCES receipts(id) ON DELETE CASCADE,
     processing_time INTEGER NOT NULL,
     ai_model VARCHAR NOT NULL DEFAULT 'gemini-2.0-flash',
     warnings JSONB DEFAULT '[]',
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```
   
   Create a storage bucket named `receipts` and make it public.

5. **Start the server**
   ```bash
   # Development mode
   npm run start:dev
   
   # Production mode
   npm run build
   npm run start:prod
   ```

6. **Verify installation**
   ```bash
   curl http://localhost:3000/extract-receipt-details/health
   ```

## 📡 API Documentation

### Core Endpoints

#### `POST /extract-receipt-details`
Extract data from a receipt image and automatically save to database.

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
  "image_url": "https://your-project.supabase.co/storage/v1/object/public/receipts/550e8400-e29b-41d4-a716-446655440000.jpg",
  "extracted_at": "2024-01-15T10:30:00.000Z"
}
```

#### `GET /extract-receipt-details/history/:extractionId` 🆕
Retrieve a specific receipt extraction by ID from database.

**Parameters:**
- `extractionId` (required): The extraction ID to retrieve

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
    }
  ],
  "subtotal": 8.99,
  "tax": 0.72,
  "total": 9.71,
  "confidence_score": 0.95,
  "image_url": "https://your-project.supabase.co/storage/v1/object/public/receipts/550e8400-e29b-41d4-a716-446655440000.jpg",
  "extracted_at": "2024-01-15T10:30:00.000Z"
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

#### `GET /extract-receipt-details/receipts` 🆕
Get all receipts with pagination support.

**Query Parameters:**
- `limit` (optional): Number of receipts to return (1-100, default: 50)
- `offset` (optional): Number of receipts to skip (default: 0)

**Example Request:**
```
GET /extract-receipt-details/receipts?limit=10&offset=0
```

**Response Example:**
```json
{
  "receipts": [
    {
      "status": "success",
      "extraction_id": "550e8400-e29b-41d4-a716-446655440000",
      "date": "2024-01-15",
      "vendor_name": "Grocery Store Inc.",
      "total": 9.71,
      "extracted_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 1
  }
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
    "Comprehensive error handling",
    "Cloud database persistence",
    "Receipt history retrieval"
  ],
  "version": "1.0.0"
}
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

### Image Storage

Images are automatically:
- **Cloud Storage**: Stored in Supabase Storage for global accessibility
- **Local Fallback**: Falls back to local storage if Supabase is unavailable
- **Optimization**: Resized to max 2048x2048, JPEG 85% quality, progressive
- **UUID Naming**: Unique identifiers prevent filename conflicts
- **Public URLs**: Direct access via Supabase CDN or local endpoints

## 🗄️ Database Schema

### Tables

**receipts**
- `id` (UUID, PK): Database primary key
- `extraction_id` (VARCHAR, UNIQUE): Public extraction identifier
- `date` (DATE): Receipt date
- `currency` (VARCHAR): Currency code
- `vendor_name` (VARCHAR): Store/vendor name
- `subtotal`, `tax`, `total` (DECIMAL): Financial amounts
- `payment_method` (VARCHAR): Payment type
- `receipt_number` (VARCHAR): Receipt reference number
- `confidence_score` (DECIMAL): AI confidence level
- `image_url` (TEXT): Stored image URL
- `status` (VARCHAR): Extraction status
- `extracted_at`, `created_at` (TIMESTAMPTZ): Timestamps

**receipt_items**
- `id` (UUID, PK): Item primary key
- `receipt_id` (UUID, FK): Reference to receipts table
- `item_name` (VARCHAR): Processed item name
- `item_cost` (DECIMAL): Item price
- `quantity` (INTEGER): Item quantity
- `original_name` (VARCHAR): Original text from receipt

**extraction_metadata**
- `id` (UUID, PK): Metadata primary key
- `receipt_id` (UUID, FK): Reference to receipts table
- `processing_time` (INTEGER): Processing time in milliseconds
- `ai_model` (VARCHAR): AI model used
- `warnings` (JSONB): Processing warnings array

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

**Total Tests**: 12 ✅ **All Passing** (focused on `ReceiptsService`)

The primary test suite is `src/receipts/receipts.service.spec.ts`, which covers the core functionality of the `ReceiptsService`.

#### Key Test Scenarios for `ReceiptsService` ✅
1.  **Successful extraction from valid image**: Verifies the end-to-end successful extraction flow.
2.  **Incorrect file type**: Ensures unsupported file types (e.g., PDF) are rejected.
3.  **Invalid AI model responses**:
    *   Handles empty (null) responses from the AI service.
    *   Handles `NOT_A_RECEIPT` errors from the AI service.
4.  **500 status response scenarios (AI Service Issues)**:
    *   Handles AI service network errors.
    *   Handles unexpected server errors from the AI service.
5.  **Database Interaction**:
    *   Verifies successful saving of extraction data to the database.
    *   Ensures the service continues successfully even if the database save fails.
6.  **Data Retrieval**:
    *   Tests successful retrieval of an extraction by its ID.
    *   Tests successful retrieval of paginated receipts.
7.  **Service Health**:
    *   Checks that the service health endpoint returns a healthy status.

### Test Architecture

- **Mocking Strategy**: External services like `AiService`, `StorageService`, and `DatabaseService` are fully mocked within `receipts.service.spec.ts` to ensure isolated unit testing of `ReceiptsService`.
- **Error Scenarios**: Covers various error conditions related to file validation, AI responses, and service availability.
- **Unit Testing**: Focuses on pure unit tests for `ReceiptsService` with no external dependencies for these tests.

### Sample Test Images

The `test/` directory contains a collection of sample images to help with manual testing and understanding various scenarios. These assets can be used with tools like Postman or `curl` to manually test the `/extract-receipt-details` endpoint and observe the API's behavior with different inputs. They can also serve as a basis for developing more comprehensive automated integration tests.

## 🏗️ Architecture

### Project Structure

```
src/
├── receipts/           # Main receipt processing module
│   ├── dto/           # Data Transfer Objects & validation
│   ├── receipts.controller.ts
│   ├── receipts.service.ts
│   ├── receipts.validation.service.ts
│   └── receipts.service.spec.ts
├── ai/                # AI service integration
│   ├── ai.service.ts
│   └── ai.module.ts
├── storage/           # File storage management
│   ├── storage.service.ts
│   ├── storage.controller.ts
│   └── storage.module.ts
├── database/          # Database integration
│   ├── database.service.ts
│   ├── supabase.service.ts
│   └── database.module.ts
├── config/            # Configuration management
│   └── configuration.ts
└── main.ts           # Application entry point
```

### Technology Stack

- **Framework**: NestJS with Express
- **Language**: TypeScript with strict type checking
- **AI Integration**: Google Gemini 2.0 Flash via OpenAI-compatible API
- **Database**: Supabase (PostgreSQL) 
- **Storage**: Supabase Storage with local fallback
- **Image Processing**: Sharp for optimization
- **Validation**: class-validator and class-transformer
- **Testing**: Jest 

### Data Flow

1. **Image Upload** → File validation and optimization
2. **AI Processing** → Gemini 2.0 Flash extraction with retry logic
3. **Data Validation** → Mathematical consistency and type checking
4. **Database Persistence** → Automatic save to Supabase (with graceful degradation)
5. **Storage** → Cloud storage with local fallback
6. **Status Assessment** → Success/partial/failed determination
7. **Response Formation** → Structured JSON with metadata

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | - | ✅ |
| `PORT` | Server port | 3000 | ❌ |
| `NODE_ENV` | Environment mode | development | ❌ |
| `FRONTEND_URL` | CORS allowed origins | http://localhost:5173 | ❌ |
| `SUPABASE_URL` | Supabase project URL | - | ✅ |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | - | ✅ |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name | receipts | ❌ |
| `STORAGE_TYPE` | Storage type (supabase/local) | supabase | ❌ |

### File Upload Limits

- **Max File Size**: 10MB
- **Supported Formats**: JPEG, PNG, WebP (all converted to JPEG for storage)
- **Validation**: MIME type and extension checking
- **Storage**: Supabase Storage (primary) with local filesystem fallback
- **Optimization**: Automatic resize and compression

## 📈 Performance & Monitoring

### Processing Metrics
- **Average Processing Time**: 2-4 seconds per receipt (varies by image complexity)
- **AI Service Timeout**: OpenAI default timeout with exponential backoff
- **Confidence Scores & Status**:
  - **0.95**: High confidence, typically results in 'success' status.
  - **0.80**: Lowered confidence due to mathematical inconsistencies in extracted totals/subtotals/taxes. May result in 'partial' status.
  - **0.70**: Low confidence due to poor image quality (e.g., blurry items, unreadable text) but critical data like the total amount was still extracted. Often results in 'partial' status with warnings.
  - **0.50**: Very low confidence due to very poor image quality where critical data (like the total amount) could not be extracted. Typically results in a 'failed' status from the validation service.
  - The `ReceiptsValidationService` determines the final 'success', 'partial', or 'failed' status. A 'failed' status is assigned if critical data (vendor name, items, or total for non-poor-quality images) is missing. A 'partial' status is assigned if confidence is below 0.7 or there are more than two warnings.
- **Retry Logic**: 3 attempts with 1s, 2s, 4s delays (exponential backoff)
- **Database Performance**: Sub-second queries with indexed extraction_id

### Monitoring Endpoints
- Health check at `/extract-receipt-details/health`
- Service capabilities and version information
- Processing time tracking in response metadata
- Database connection status monitoring

### Scalability Features
- **Supabase Integration**: Cloud-native database with automatic scaling
- **CDN Storage**: Global image delivery via Supabase CDN
- **Graceful Degradation**: Continues operation if database/storage fails
- **Connection Pooling**: Efficient database connection management

---

## 🚀 Deployment

This application is designed for continuous deployment to **Google Cloud Run** directly from the `main` branch.

### Git-Based Deployment (Google Cloud Run)

1.  **Connect to GitHub:** In the Google Cloud Run "Create Service" flow, choose to **"Continuously deploy new revisions from a source repository"**. Connect it to your `Digitara-Backend` GitHub repository.
2.  **Build Settings:**
    *   **Branch:** `main`
    *   **Build Type:** `Dockerfile` (Google Cloud Build will automatically find and use the `Dockerfile` in this repository).
3.  **Service Configuration:**
    *   **Port:** `3000`
    *   **CPU & Memory:** Start with `1 vCPU` and `512MiB`.
    *   **Autoscaling:** Min `0`, Max `2` (or higher as needed).
4.  **Environment Variables & Secrets:**
    *   In the "Variables & Secrets" tab, add all the necessary environment variables from the `.env.example` file.
    *   **CRITICAL:** Use **Google Secret Manager** for sensitive values like `GEMINI_API_KEY` and `SUPABASE_SERVICE_KEY`.
5.  **Deploy:** Create the service. All subsequent pushes to the `main` branch will automatically build and deploy a new version.

---

##  Disclaimer

This project was originally created as part of a technical assessment, but all code, logic, and design presented here are my own work, rebranded and enhanced independently.
