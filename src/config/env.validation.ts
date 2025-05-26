import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  // Server Configuration
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  // AI Configuration
  GEMINI_API_KEY: Joi.string().required().messages({
    'string.empty': 'GEMINI_API_KEY is required',
    'any.required': 'GEMINI_API_KEY environment variable must be provided',
  }),

  // File Upload Configuration
  MAX_FILE_SIZE: Joi.number().default(10485760), // 10MB
  UPLOAD_DIR: Joi.string().default('uploads'),

  // CORS Configuration
  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
});
