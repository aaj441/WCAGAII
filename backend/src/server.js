const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const pino = require('pino');
const swaggerUi = require('swagger-ui-express');
const { scanURL, scanHTML, getHealthStatus, browserPool } = require('./scanner');
const { ssrfProtection } = require('./middleware/ssrfProtection');
const { manager: circuitBreakerManager } = require('./services/circuitBreaker');
const { correlationIdMiddleware } = require('./middleware/correlationId');
const { validateRequest, ScanRequestSchema, BulkScanRequestSchema } = require('./schemas/validation');
const { metricsHandler, httpRequestDuration, scanCounter, scanDuration, updateBrowserPoolMetrics } = require('./services/metrics');
const { auditLogger } = require('./services/auditLogger');
const swaggerSpec = require('../swagger');

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

// Correlation ID for request tracing
app.use(correlationIdMiddleware);

// Request logging with metrics
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;

    // Log request
    logger.info({
      correlationId: req.correlationId,
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: duration * 1000
    });

    // Record metrics
    httpRequestDuration.observe(
      { method: req.method, route: req.path, status: res.statusCode },
      duration
    );

    // Audit log API access
    if (req.path.startsWith('/api/')) {
      auditLogger.logApiAccess({
        correlationId: req.correlationId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: duration * 1000,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
    }
  });
  next();
});

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Prometheus Metrics
app.get('/metrics', metricsHandler);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await getHealthStatus();

    // Update browser pool metrics
    if (health.browserPool) {
      updateBrowserPoolMetrics(health.browserPool);
    }

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

// Browser Pool Stats endpoint
app.get('/api/pool/stats', (req, res) => {
  try {
    const stats = browserPool.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get browser pool stats',
      message: error.message
    });
  }
});

// Circuit Breaker Status endpoint
app.get('/api/circuit-breakers', (req, res) => {
  try {
    const status = circuitBreakerManager.getAllStatus();
    const metrics = circuitBreakerManager.getAllMetrics();
    res.json({ status, metrics });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get circuit breaker status',
      message: error.message
    });
  }
});

// Main scan endpoint with SSRF protection and validation
app.post('/api/scan', validateRequest(ScanRequestSchema), ssrfProtection, async (req, res) => {
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
      correlationId: req.correlationId,
      scanId,
      violations: result.violations.length,
      scanTime
    }, 'Scan completed');

    // Record metrics
    scanCounter.inc({ type, status: 'success' });
    scanDuration.observe({ type, status: 'success' }, scanTime / 1000);

    // Audit log
    await auditLogger.logScan({
      correlationId: req.correlationId,
      scanId,
      type,
      input: type === 'url' ? input : '[HTML]',
      violations: result.violations.length,
      complianceScore: result.summary.complianceScore,
      scanTime,
      ip: req.ip
    });

    res.json({
      scanId,
      correlationId: req.correlationId,
      ...result,
      scanTime
    });

  } catch (error) {
    logger.error({ correlationId: req.correlationId, scanId, error: error.message }, 'Scan failed');

    // Record metrics
    scanCounter.inc({ type, status: 'error' });
    scanDuration.observe({ type, status: 'error' }, (Date.now() - Date.now()) / 1000);

    // Audit log error
    await auditLogger.logScan({
      correlationId: req.correlationId,
      scanId,
      type,
      status: 'ERROR',
      error: error.message,
      ip: req.ip
    });

    res.status(500).json({
      scanId,
      correlationId: req.correlationId,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Bulk scan endpoint (for stress testing)
app.post('/api/scan/bulk', validateRequest(BulkScanRequestSchema), async (req, res) => {
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
