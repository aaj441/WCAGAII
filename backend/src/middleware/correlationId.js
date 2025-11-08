/**
 * Correlation ID Middleware
 *
 * Adds unique correlation IDs to track requests across distributed systems
 */

const crypto = require('crypto');

function generateCorrelationId() {
  return `req_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

function correlationIdMiddleware(req, res, next) {
  // Use existing correlation ID from header or generate new one
  const correlationId = req.headers['x-correlation-id'] || generateCorrelationId();

  // Attach to request
  req.correlationId = correlationId;

  // Add to response headers
  res.setHeader('X-Correlation-ID', correlationId);

  // Add to request context for logging
  req.context = {
    correlationId,
    requestId: generateCorrelationId(),
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  };

  next();
}

module.exports = {
  correlationIdMiddleware,
  generateCorrelationId
};
