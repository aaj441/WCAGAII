/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by monitoring service health and failing fast
 * when a dependent service is experiencing issues.
 *
 * States:
 * - CLOSED: Normal operation, all requests pass through
 * - OPEN: Service is failing, requests fail immediately with fallback
 * - HALF_OPEN: Testing if service has recovered
 *
 * Use Cases:
 * - AI/ML service calls (OpenAI, Claude, etc.)
 * - External API integrations
 * - Database connections
 * - Third-party services
 */

const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailTime = null;
    this.lastSuccessTime = null;
    this.lastStateChange = Date.now();

    // Configuration
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000; // 60 seconds
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds

    // Metrics
    this.metrics = {
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      totalFallbacks: 0,
      totalRejections: 0,
      stateChanges: 0
    };

    // Event listeners
    this.listeners = {
      open: [],
      close: [],
      halfOpen: [],
      failure: [],
      success: [],
      fallback: []
    };
  }

  /**
   * Execute a function with circuit breaker protection
   *
   * @param {Function} fn - Async function to execute
   * @param {Function} fallback - Fallback function if circuit is open
   * @returns {Promise} Result from fn or fallback
   */
  async execute(fn, fallback = null) {
    this.metrics.totalRequests++;

    // Check circuit state
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('HALF_OPEN');
      } else {
        this.metrics.totalRejections++;
        logger.warn({
          circuitBreaker: this.name,
          state: this.state,
          failures: this.failures
        }, 'Circuit breaker OPEN, rejecting request');

        if (fallback) {
          this.metrics.totalFallbacks++;
          this.emit('fallback');
          return await fallback();
        }

        throw new Error(`Circuit breaker "${this.name}" is OPEN. Service is unavailable.`);
      }
    }

    try {
      // Execute the function with timeout
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);

      if (fallback) {
        this.metrics.totalFallbacks++;
        this.emit('fallback');
        logger.info({
          circuitBreaker: this.name,
          error: error.message
        }, 'Using fallback due to error');
        return await fallback();
      }

      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), this.timeout)
      )
    ]);
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    this.metrics.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.successes++;

      if (this.successes >= this.successThreshold) {
        this.transitionTo('CLOSED');
      }
    } else {
      this.failures = 0;
    }

    this.emit('success');
  }

  /**
   * Handle failed execution
   */
  onFailure(error) {
    this.metrics.totalFailures++;
    this.failures++;
    this.lastFailTime = Date.now();

    logger.warn({
      circuitBreaker: this.name,
      failures: this.failures,
      threshold: this.failureThreshold,
      error: error.message
    }, 'Circuit breaker registered failure');

    this.emit('failure', error);

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
    } else if (this.failures >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  /**
   * Check if we should attempt to reset the circuit
   */
  shouldAttemptReset() {
    return Date.now() - this.lastStateChange >= this.resetTimeout;
  }

  /**
   * Transition to a new state
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();
    this.metrics.stateChanges++;

    if (newState === 'CLOSED') {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === 'HALF_OPEN') {
      this.successes = 0;
    }

    logger.info({
      circuitBreaker: this.name,
      oldState,
      newState,
      failures: this.failures,
      successes: this.successes
    }, 'Circuit breaker state changed');

    this.emit(newState.toLowerCase().replace('_', ''));
  }

  /**
   * Manually open the circuit
   */
  open() {
    this.transitionTo('OPEN');
  }

  /**
   * Manually close the circuit
   */
  close() {
    this.transitionTo('CLOSED');
  }

  /**
   * Get current circuit status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailTime: this.lastFailTime,
      lastSuccessTime: this.lastSuccessTime,
      lastStateChange: this.lastStateChange,
      metrics: { ...this.metrics },
      config: {
        failureThreshold: this.failureThreshold,
        successThreshold: this.successThreshold,
        timeout: this.timeout,
        resetTimeout: this.resetTimeout
      }
    };
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics() {
    const { totalRequests, totalSuccesses, totalFailures, totalFallbacks, totalRejections } = this.metrics;

    return {
      ...this.metrics,
      successRate: totalRequests > 0 ? (totalSuccesses / totalRequests * 100).toFixed(2) + '%' : 'N/A',
      failureRate: totalRequests > 0 ? (totalFailures / totalRequests * 100).toFixed(2) + '%' : 'N/A',
      fallbackRate: totalRequests > 0 ? (totalFallbacks / totalRequests * 100).toFixed(2) + '%' : 'N/A'
    };
  }

  /**
   * Reset all metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      totalFallbacks: 0,
      totalRejections: 0,
      stateChanges: this.metrics.stateChanges
    };
  }

  /**
   * Event listener registration
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error({ error: error.message }, 'Error in circuit breaker event listener');
        }
      });
    }
  }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers for different services
 */
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Get or create a circuit breaker
   */
  getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({ ...options, name }));
    }
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breakers status
   */
  getAllStatus() {
    const status = {};
    this.breakers.forEach((breaker, name) => {
      status[name] = breaker.getStatus();
    });
    return status;
  }

  /**
   * Get all circuit breakers metrics
   */
  getAllMetrics() {
    const metrics = {};
    this.breakers.forEach((breaker, name) => {
      metrics[name] = breaker.getMetrics();
    });
    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    this.breakers.forEach(breaker => breaker.close());
  }
}

// Singleton manager instance
const manager = new CircuitBreakerManager();

module.exports = {
  CircuitBreaker,
  CircuitBreakerManager,
  manager
};
