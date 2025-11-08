const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const pino = require('pino');
const { scanURL, scanHTML, getHealthStatus } = require('./scanner');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

const app = express();
const PORT = process.env.PORT || 8000;

// Security middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: Date.now() - start
    });
  });
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await getHealthStatus();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Readiness check (for Kubernetes/Railway)
app.get('/health/ready', async (req, res) => {
  const health = await getHealthStatus();
  if (health.status === 'healthy' && health.puppeteerReady) {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false });
  }
});

// Liveness check
app.get('/health/live', (req, res) => {
  res.status(200).json({
    alive: true,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Main scan endpoint
app.post('/api/scan', async (req, res) => {
  const { type, input, options = {} } = req.body;

  // Validation
  if (!type || !input) {
    return res.status(400).json({
      error: 'Missing required fields: type and input'
    });
  }

  if (!['url', 'html'].includes(type)) {
    return res.status(400).json({
      error: 'Invalid type. Must be "url" or "html"'
    });
  }

  const scanId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  logger.info({ scanId, type, input: type === 'url' ? input : '[HTML]' }, 'Starting scan');

  try {
    const startTime = Date.now();
    let result;

    if (type === 'url') {
      result = await scanURL(input, options);
    } else {
      result = await scanHTML(input, options);
    }

    const scanTime = Date.now() - startTime;

    logger.info({
      scanId,
      violations: result.violations.length,
      scanTime
    }, 'Scan completed');

    res.json({
      scanId,
      ...result,
      scanTime
    });

  } catch (error) {
    logger.error({ scanId, error: error.message }, 'Scan failed');
    res.status(500).json({
      scanId,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Bulk scan endpoint (for stress testing)
app.post('/api/scan/bulk', async (req, res) => {
  const { urls, options = {} } = req.body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({
      error: 'urls must be a non-empty array'
    });
  }

  if (urls.length > 100) {
    return res.status(400).json({
      error: 'Maximum 100 URLs per bulk scan'
    });
  }

  const batchId = `batch_${Date.now()}`;
  logger.info({ batchId, count: urls.length }, 'Starting bulk scan');

  // Return immediately and process async
  res.json({
    batchId,
    status: 'processing',
    totalUrls: urls.length,
    message: 'Bulk scan initiated. Check /api/scan/bulk/:batchId for status'
  });

  // Process scans in background (in production, use a queue like Bull/BullMQ)
  processBulkScan(batchId, urls, options);
});

// Bulk scan status endpoint
const bulkScanResults = new Map();

app.get('/api/scan/bulk/:batchId', (req, res) => {
  const { batchId } = req.params;
  const result = bulkScanResults.get(batchId);

  if (!result) {
    return res.status(404).json({
      error: 'Batch not found'
    });
  }

  res.json(result);
});

async function processBulkScan(batchId, urls, options) {
  const results = [];
  const errors = [];
  const startTime = Date.now();

  bulkScanResults.set(batchId, {
    status: 'processing',
    progress: 0,
    total: urls.length,
    results: [],
    errors: []
  });

  const concurrency = parseInt(process.env.SCAN_CONCURRENCY) || 3;

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(url => scanURL(url, options))
    );

    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.push({
          url: batch[idx],
          ...result.value
        });
      } else {
        errors.push({
          url: batch[idx],
          error: result.reason.message
        });
      }
    });

    // Update progress
    bulkScanResults.set(batchId, {
      status: 'processing',
      progress: Math.min(i + concurrency, urls.length),
      total: urls.length,
      results,
      errors
    });

    logger.info({
      batchId,
      progress: `${Math.min(i + concurrency, urls.length)}/${urls.length}`
    }, 'Bulk scan progress');
  }

  const totalTime = Date.now() - startTime;

  bulkScanResults.set(batchId, {
    status: 'completed',
    progress: urls.length,
    total: urls.length,
    results,
    errors,
    totalTime,
    averageTimePerScan: totalTime / urls.length
  });

  logger.info({
    batchId,
    totalScans: results.length,
    errors: errors.length,
    totalTime
  }, 'Bulk scan completed');
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.url
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

const server = app.listen(PORT, () => {
  logger.info(`🚀 WCAGAI Backend running on port ${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/health`);
  logger.info(`🔍 Scan endpoint: POST http://localhost:${PORT}/api/scan`);
});

module.exports = app;
