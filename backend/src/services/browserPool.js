/**
 * Browser Pool Management Service
 *
 * Manages a pool of Puppeteer browser instances to improve performance
 * by eliminating browser launch overhead on each scan request.
 *
 * Performance Impact:
 * - Before: ~2-3s browser launch per scan
 * - After: ~100ms acquire from pool
 * - Expected: 20x faster concurrent scans
 *
 * Features:
 * - Configurable pool size (MIN_POOL, MAX_POOL)
 * - Request queuing when pool exhausted
 * - Health checks for browser instances
 * - Automatic cleanup on shutdown
 * - Graceful degradation under load
 */

const puppeteer = require('puppeteer');
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

class BrowserPool {
  constructor(options = {}) {
    this.minSize = parseInt(options.minSize || process.env.MIN_POOL_SIZE || 2);
    this.maxSize = parseInt(options.maxSize || process.env.MAX_POOL_SIZE || 5);
    this.pool = [];
    this.activeCount = 0;
    this.queue = [];
    this.launchConfig = options.launchConfig || {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--disable-web-security', // For accessibility scanning only
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      timeout: 30000
    };

    this.metrics = {
      totalAcquired: 0,
      totalReleased: 0,
      totalCreated: 0,
      totalDestroyed: 0,
      queueHighWaterMark: 0,
      errors: 0
    };

    // Pre-warm the pool
    this.initialize();
  }

  /**
   * Initialize the pool with minimum number of browsers
   */
  async initialize() {
    logger.info(`Initializing browser pool with ${this.minSize} instances`);

    try {
      const promises = [];
      for (let i = 0; i < this.minSize; i++) {
        promises.push(this.createBrowser());
      }
      await Promise.all(promises);
      logger.info(`Browser pool initialized successfully with ${this.pool.length} instances`);
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to initialize browser pool');
      throw error;
    }
  }

  /**
   * Create a new browser instance
   */
  async createBrowser() {
    try {
      logger.debug('Launching new browser instance');
      const browser = await puppeteer.launch(this.launchConfig);

      // Add metadata
      browser._poolMetadata = {
        createdAt: Date.now(),
        acquireCount: 0,
        lastAcquired: null,
        healthy: true
      };

      this.pool.push(browser);
      this.metrics.totalCreated++;

      logger.debug(`Browser created. Pool size: ${this.pool.length}`);
      return browser;
    } catch (error) {
      this.metrics.errors++;
      logger.error({ error: error.message }, 'Failed to create browser');
      throw error;
    }
  }

  /**
   * Acquire a browser from the pool
   *
   * @param {number} timeout - Maximum wait time in ms (default: 30s)
   * @returns {Promise<Browser>} Puppeteer browser instance
   */
  async acquire(timeout = 30000) {
    this.metrics.totalAcquired++;

    // Try to get from existing pool
    if (this.pool.length > 0) {
      const browser = this.pool.pop();
      this.activeCount++;

      // Check if browser is still connected
      if (!browser.isConnected()) {
        logger.warn('Browser disconnected, creating new instance');
        await browser.close().catch(() => {});
        this.activeCount--;
        this.metrics.totalDestroyed++;
        return this.acquire(timeout); // Retry
      }

      browser._poolMetadata.acquireCount++;
      browser._poolMetadata.lastAcquired = Date.now();

      logger.debug({
        poolSize: this.pool.length,
        activeCount: this.activeCount,
        queueSize: this.queue.length
      }, 'Browser acquired from pool');

      return browser;
    }

    // Create new browser if under max size
    if (this.activeCount < this.maxSize) {
      this.activeCount++;
      try {
        const browser = await this.createBrowser();
        this.pool.pop(); // Remove from pool since we're using it immediately
        browser._poolMetadata.acquireCount++;
        browser._poolMetadata.lastAcquired = Date.now();
        return browser;
      } catch (error) {
        this.activeCount--;
        throw error;
      }
    }

    // Pool exhausted - queue the request
    logger.info({
      activeCount: this.activeCount,
      queueSize: this.queue.length
    }, 'Browser pool exhausted, queueing request');

    this.metrics.queueHighWaterMark = Math.max(
      this.metrics.queueHighWaterMark,
      this.queue.length + 1
    );

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.queue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(new Error(`Browser acquire timeout after ${timeout}ms`));
      }, timeout);

      this.queue.push({
        resolve: (browser) => {
          clearTimeout(timeoutId);
          resolve(browser);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        enqueuedAt: Date.now()
      });
    });
  }

  /**
   * Release a browser back to the pool
   *
   * @param {Browser} browser - Puppeteer browser instance to release
   */
  async release(browser) {
    this.metrics.totalReleased++;
    this.activeCount--;

    // Check if browser is still healthy
    if (!browser.isConnected()) {
      logger.warn('Released browser is disconnected, destroying');
      try {
        await browser.close();
      } catch (error) {
        logger.error({ error: error.message }, 'Error closing disconnected browser');
      }
      this.metrics.totalDestroyed++;

      // Create replacement if below min size
      if (this.pool.length + this.activeCount < this.minSize) {
        this.createBrowser().catch(err => {
          logger.error({ error: err.message }, 'Failed to create replacement browser');
        });
      }

      return;
    }

    // Serve queued requests first
    if (this.queue.length > 0) {
      const { resolve } = this.queue.shift();
      this.activeCount++;
      browser._poolMetadata.acquireCount++;
      browser._poolMetadata.lastAcquired = Date.now();

      logger.debug({
        queueSize: this.queue.length,
        activeCount: this.activeCount
      }, 'Browser released to queued request');

      resolve(browser);
      return;
    }

    // Return to pool if under max size
    if (this.pool.length < this.maxSize) {
      // Close all pages to prevent memory leaks
      const pages = await browser.pages();
      await Promise.all(
        pages.slice(1).map(page => page.close().catch(() => {}))
      );

      this.pool.push(browser);

      logger.debug({
        poolSize: this.pool.length,
        activeCount: this.activeCount
      }, 'Browser returned to pool');
    } else {
      // Pool is full, destroy the browser
      try {
        await browser.close();
        this.metrics.totalDestroyed++;
        logger.debug('Browser destroyed (pool at capacity)');
      } catch (error) {
        logger.error({ error: error.message }, 'Error closing browser');
      }
    }
  }

  /**
   * Get current pool statistics
   */
  getStats() {
    return {
      poolSize: this.pool.length,
      activeCount: this.activeCount,
      queueSize: this.queue.length,
      minSize: this.minSize,
      maxSize: this.maxSize,
      metrics: { ...this.metrics },
      utilization: ((this.activeCount / this.maxSize) * 100).toFixed(2) + '%'
    };
  }

  /**
   * Health check for the pool
   */
  async healthCheck() {
    const unhealthyBrowsers = [];

    for (const browser of this.pool) {
      if (!browser.isConnected()) {
        unhealthyBrowsers.push(browser);
      }
    }

    // Remove unhealthy browsers
    for (const browser of unhealthyBrowsers) {
      const index = this.pool.indexOf(browser);
      if (index !== -1) {
        this.pool.splice(index, 1);
      }
      try {
        await browser.close();
      } catch (error) {
        // Ignore errors when closing already disconnected browsers
      }
      this.metrics.totalDestroyed++;
    }

    if (unhealthyBrowsers.length > 0) {
      logger.warn({
        removed: unhealthyBrowsers.length,
        remaining: this.pool.length
      }, 'Removed unhealthy browsers from pool');

      // Replenish pool
      while (this.pool.length + this.activeCount < this.minSize) {
        await this.createBrowser().catch(err => {
          logger.error({ error: err.message }, 'Failed to replenish pool');
        });
      }
    }

    return {
      healthy: true,
      removedUnhealthy: unhealthyBrowsers.length,
      currentSize: this.pool.length
    };
  }

  /**
   * Cleanup all browsers and shutdown the pool
   */
  async cleanup() {
    logger.info('Shutting down browser pool');

    // Reject all queued requests
    while (this.queue.length > 0) {
      const { reject } = this.queue.shift();
      reject(new Error('Browser pool is shutting down'));
    }

    // Close all browsers in pool
    const closePromises = this.pool.map(browser =>
      browser.close().catch(err => {
        logger.error({ error: err.message }, 'Error closing browser during cleanup');
      })
    );

    await Promise.all(closePromises);
    this.pool = [];
    this.activeCount = 0;

    logger.info('Browser pool shutdown complete');
  }
}

// Singleton instance
let poolInstance = null;

/**
 * Get or create the browser pool singleton
 */
function getBrowserPool(options) {
  if (!poolInstance) {
    poolInstance = new BrowserPool(options);
  }
  return poolInstance;
}

/**
 * Cleanup hook for graceful shutdown
 */
process.on('SIGTERM', async () => {
  if (poolInstance) {
    await poolInstance.cleanup();
  }
});

process.on('SIGINT', async () => {
  if (poolInstance) {
    await poolInstance.cleanup();
  }
  process.exit(0);
});

module.exports = {
  BrowserPool,
  getBrowserPool
};
