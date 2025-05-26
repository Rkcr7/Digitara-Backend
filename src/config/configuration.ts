export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  },
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760, // 10MB
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png'],
  },
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
});
