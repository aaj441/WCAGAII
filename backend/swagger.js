/**
 * Swagger/OpenAPI Documentation
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WCAGAI Enterprise API',
      version: '3.0.0',
      description: 'Enterprise-grade WCAG 2.2 AA Accessibility Scanner API',
      contact: {
        name: 'API Support',
        email: 'support@wcagai.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:8000',
        description: 'Development server'
      },
      {
        url: 'https://api.wcagai.com',
        description: 'Production server'
      }
    ],
    components: {
      schemas: {
        ScanRequest: {
          type: 'object',
          required: ['type', 'input'],
          properties: {
            type: {
              type: 'string',
              enum: ['url', 'html'],
              description: 'Type of scan to perform'
            },
            input: {
              type: 'string',
              description: 'URL or HTML content to scan'
            },
            options: {
              type: 'object',
              properties: {
                timeout: {
                  type: 'number',
                  minimum: 5000,
                  maximum: 60000,
                  description: 'Scan timeout in milliseconds'
                },
                viewport: {
                  type: 'object',
                  properties: {
                    width: { type: 'number', minimum: 320, maximum: 3840 },
                    height: { type: 'number', minimum: 240, maximum: 2160 }
                  }
                }
              }
            }
          }
        },
        ScanResponse: {
          type: 'object',
          properties: {
            scanId: { type: 'string' },
            url: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            scanTime: { type: 'number' },
            summary: {
              type: 'object',
              properties: {
                violations: { type: 'number' },
                passes: { type: 'number' },
                incomplete: { type: 'number' },
                complianceScore: { type: 'number' },
                violationsBySeverity: {
                  type: 'object',
                  properties: {
                    critical: { type: 'number' },
                    serious: { type: 'number' },
                    moderate: { type: 'number' },
                    minor: { type: 'number' }
                  }
                }
              }
            },
            violations: { type: 'array', items: { type: 'object' } }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            code: { type: 'string' }
          }
        }
      },
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      }
    },
    tags: [
      {
        name: 'Scanning',
        description: 'Accessibility scanning operations'
      },
      {
        name: 'Health',
        description: 'Service health and monitoring'
      },
      {
        name: 'Metrics',
        description: 'Performance and operational metrics'
      }
    ]
  },
  apis: ['./src/server.js', './src/routes/*.js']
};

const specs = swaggerJsdoc(options);

module.exports = specs;
