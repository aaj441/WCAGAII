require('dotenv').config();

module.exports = {
  // Server Configuration
  port: parseInt(process.env.PORT) || 8000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // CORS Configuration
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Scanning Configuration
  scanTimeout: parseInt(process.env.SCAN_TIMEOUT) || 30000,
  scanConcurrency: parseInt(process.env.SCAN_CONCURRENCY) || 3,
  maxRetriesPerScan: parseInt(process.env.MAX_RETRIES) || 3,

  // Puppeteer Configuration
  puppeteer: {
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920x1080'
    ]
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: process.env.NODE_ENV === 'development'
  },

  // Rate Limiting (for future implementation)
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX) || 100
  },

  // Security Configuration
  security: {
    blockPrivateIPs: process.env.BLOCK_PRIVATE_IPS !== 'false',
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb'
  },

  // Stress Test Configuration
  stressTest: {
    defaultDuration: parseInt(process.env.STRESS_TEST_DURATION) || 300,
    defaultConcurrency: parseInt(process.env.STRESS_TEST_CONCURRENCY) || 5,
    maxConcurrency: parseInt(process.env.STRESS_TEST_MAX_CONCURRENCY) || 20
  }
};
