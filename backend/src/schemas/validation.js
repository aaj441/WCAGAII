/**
 * Input Validation Schemas with Zod
 *
 * Type-safe validation for all API endpoints
 */

const { z } = require('zod');

// Scan Request Schema
const ScanRequestSchema = z.object({
  type: z.enum(['url', 'html'], {
    errorMap: () => ({ message: 'Type must be either "url" or "html"' })
  }),
  input: z.string()
    .min(1, 'Input cannot be empty')
    .max(1000000, 'Input exceeds maximum size of 1MB'),
  options: z.object({
    timeout: z.number()
      .min(5000, 'Timeout must be at least 5 seconds')
      .max(60000, 'Timeout cannot exceed 60 seconds')
      .optional(),
    viewport: z.object({
      width: z.number().min(320).max(3840).optional(),
      height: z.number().min(240).max(2160).optional()
    }).optional(),
    waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2']).optional()
  }).optional()
});

// Bulk Scan Request Schema
const BulkScanRequestSchema = z.object({
  urls: z.array(z.string().url('Each URL must be valid'))
    .min(1, 'URLs array cannot be empty')
    .max(100, 'Maximum 100 URLs per bulk scan'),
  options: ScanRequestSchema.shape.options.optional()
});

// Validation Middleware Factory
function validateRequest(schema) {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation Error',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      next(error);
    }
  };
}

module.exports = {
  ScanRequestSchema,
  BulkScanRequestSchema,
  validateRequest
};
