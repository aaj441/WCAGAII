/**
 * Prometheus Metrics Service
 *
 * Tracks application metrics for monitoring and alerting
 */

const promClient = require('prom-client');

// Create a Registry
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom Metrics

// Scan Duration Histogram
const scanDuration = new promClient.Histogram({
  name: 'wcagai_scan_duration_seconds',
  help: 'Duration of accessibility scans in seconds',
  labelNames: ['type', 'status'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60]
});
register.registerMetric(scanDuration);

// Scan Counter
const scanCounter = new promClient.Counter({
  name: 'wcagai_scans_total',
  help: 'Total number of scans performed',
  labelNames: ['type', 'status']
});
register.registerMetric(scanCounter);

// Violations Gauge
const violationsGauge = new promClient.Gauge({
  name: 'wcagai_violations_count',
  help: 'Number of WCAG violations found',
  labelNames: ['severity']
});
register.registerMetric(violationsGauge);

// Browser Pool Gauge
const browserPoolGauge = new promClient.Gauge({
  name: 'wcagai_browser_pool_size',
  help: 'Current browser pool statistics',
  labelNames: ['status']
});
register.registerMetric(browserPoolGauge);

// Circuit Breaker Gauge
const circuitBreakerGauge = new promClient.Gauge({
  name: 'wcagai_circuit_breaker_state',
  help: 'Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
  labelNames: ['name']
});
register.registerMetric(circuitBreakerGauge);

// HTTP Request Duration
const httpRequestDuration = new promClient.Histogram({
  name: 'wcagai_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
register.registerMetric(httpRequestDuration);

// Error Counter
const errorCounter = new promClient.Counter({
  name: 'wcagai_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'code']
});
register.registerMetric(errorCounter);

// Update browser pool metrics
function updateBrowserPoolMetrics(stats) {
  browserPoolGauge.set({ status: 'available' }, stats.poolSize);
  browserPoolGauge.set({ status: 'active' }, stats.activeCount);
  browserPoolGauge.set({ status: 'queued' }, stats.queueSize);
}

// Update circuit breaker metrics
function updateCircuitBreakerMetrics(name, state) {
  const stateValue = state === 'CLOSED' ? 0 : state === 'HALF_OPEN' ? 1 : 2;
  circuitBreakerGauge.set({ name }, stateValue);
}

// Metrics endpoint handler
async function metricsHandler(req, res) {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
}

module.exports = {
  register,
  scanDuration,
  scanCounter,
  violationsGauge,
  browserPoolGauge,
  circuitBreakerGauge,
  httpRequestDuration,
  errorCounter,
  updateBrowserPoolMetrics,
  updateCircuitBreakerMetrics,
  metricsHandler
};
