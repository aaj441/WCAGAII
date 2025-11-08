/**
 * Redis Cluster HA Client
 *
 * Features:
 * - High Availability with cluster support
 * - Automatic failover
 * - Connection pooling
 * - Graceful fallback to in-memory cache
 * - Circuit breaker integration
 * - Prometheus metrics
 */

const Redis = require('ioredis');
const { CircuitBreakerManager } = require('./circuitBreaker');

class RedisClusterClient {
  constructor(options = {}) {
    this.options = {
      enableCluster: process.env.REDIS_CLUSTER_ENABLED === 'true',
      nodes: this.parseClusterNodes(),
      fallbackToMemory: options.fallbackToMemory !== false,
      keyPrefix: options.keyPrefix || 'wcagai:',
      ttl: options.ttl || 3600, // 1 hour default
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
    };

    // In-memory fallback cache
    this.memoryCache = new Map();
    this.memoryCacheTTL = new Map();

    // Connection state
    this.connected = false;
    this.client = null;

    // Circuit breaker for Redis operations
    this.circuitBreaker = CircuitBreakerManager.getBreaker('redis', {
      failureThreshold: 5,
      resetTimeout: 30000,
    });

    // Metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      fallbacks: 0,
    };

    this.initialize();
  }

  /**
   * Parse cluster nodes from environment
   */
  parseClusterNodes() {
    const nodesEnv = process.env.REDIS_CLUSTER_NODES;
    if (!nodesEnv) {
      return [];
    }

    return nodesEnv.split(',').map(node => {
      const [host, port] = node.trim().split(':');
      return { host, port: parseInt(port) || 6379 };
    });
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    try {
      if (this.options.enableCluster && this.options.nodes.length > 0) {
        // Cluster mode
        this.client = new Redis.Cluster(this.options.nodes, {
          redisOptions: {
            password: process.env.REDIS_PASSWORD,
            tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
            connectTimeout: 5000,
            retryStrategy: (times) => {
              if (times > this.options.retryAttempts) {
                return null; // Stop retrying
              }
              return Math.min(times * this.options.retryDelay, 5000);
            },
          },
          clusterRetryStrategy: (times) => {
            if (times > this.options.retryAttempts) {
              return null;
            }
            return Math.min(times * this.options.retryDelay, 5000);
          },
        });
      } else if (process.env.REDIS_URL) {
        // Standalone mode
        this.client = new Redis(process.env.REDIS_URL, {
          password: process.env.REDIS_PASSWORD,
          tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
          maxRetriesPerRequest: this.options.retryAttempts,
          retryStrategy: (times) => {
            if (times > this.options.retryAttempts) {
              return null;
            }
            return Math.min(times * this.options.retryDelay, 5000);
          },
        });
      }

      if (this.client) {
        this.client.on('connect', () => {
          console.log('[Redis] Connected successfully');
          this.connected = true;
        });

        this.client.on('error', (err) => {
          console.error('[Redis] Connection error:', err.message);
          this.connected = false;
          this.metrics.errors++;
        });

        this.client.on('close', () => {
          console.log('[Redis] Connection closed');
          this.connected = false;
        });

        // Wait for connection
        await this.client.ping();
        this.connected = true;
      } else {
        console.warn('[Redis] No Redis configuration found, using in-memory cache');
      }
    } catch (error) {
      console.error('[Redis] Initialization failed:', error.message);
      this.connected = false;
      if (!this.options.fallbackToMemory) {
        throw error;
      }
    }

    // Start memory cache cleanup
    this.startMemoryCacheCleanup();
  }

  /**
   * Get value from cache
   */
  async get(key) {
    const prefixedKey = this.options.keyPrefix + key;

    if (this.connected && this.client) {
      try {
        const value = await this.circuitBreaker.execute(async () => {
          return await this.client.get(prefixedKey);
        });

        if (value !== null) {
          this.metrics.hits++;
          return JSON.parse(value);
        } else {
          this.metrics.misses++;
          return null;
        }
      } catch (error) {
        console.error('[Redis] Get error:', error.message);
        this.metrics.errors++;
        return this.getFromMemory(key);
      }
    }

    return this.getFromMemory(key);
  }

  /**
   * Set value in cache
   */
  async set(key, value, ttl = null) {
    const prefixedKey = this.options.keyPrefix + key;
    const serialized = JSON.stringify(value);
    const expiry = ttl || this.options.ttl;

    if (this.connected && this.client) {
      try {
        await this.circuitBreaker.execute(async () => {
          if (expiry) {
            await this.client.setex(prefixedKey, expiry, serialized);
          } else {
            await this.client.set(prefixedKey, serialized);
          }
        });
        return true;
      } catch (error) {
        console.error('[Redis] Set error:', error.message);
        this.metrics.errors++;
        this.setInMemory(key, value, expiry);
        return false;
      }
    }

    this.setInMemory(key, value, expiry);
    return true;
  }

  /**
   * Delete value from cache
   */
  async delete(key) {
    const prefixedKey = this.options.keyPrefix + key;

    if (this.connected && this.client) {
      try {
        await this.circuitBreaker.execute(async () => {
          await this.client.del(prefixedKey);
        });
      } catch (error) {
        console.error('[Redis] Delete error:', error.message);
        this.metrics.errors++;
      }
    }

    this.memoryCache.delete(key);
    this.memoryCacheTTL.delete(key);
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    const prefixedKey = this.options.keyPrefix + key;

    if (this.connected && this.client) {
      try {
        const result = await this.circuitBreaker.execute(async () => {
          return await this.client.exists(prefixedKey);
        });
        return result === 1;
      } catch (error) {
        console.error('[Redis] Exists error:', error.message);
        this.metrics.errors++;
      }
    }

    return this.memoryCache.has(key);
  }

  /**
   * Increment value
   */
  async incr(key) {
    const prefixedKey = this.options.keyPrefix + key;

    if (this.connected && this.client) {
      try {
        return await this.circuitBreaker.execute(async () => {
          return await this.client.incr(prefixedKey);
        });
      } catch (error) {
        console.error('[Redis] Incr error:', error.message);
        this.metrics.errors++;
      }
    }

    const current = this.memoryCache.get(key) || 0;
    const newValue = current + 1;
    this.setInMemory(key, newValue);
    return newValue;
  }

  /**
   * Set with expiry (atomic)
   */
  async setex(key, seconds, value) {
    return this.set(key, value, seconds);
  }

  /**
   * Get multiple keys
   */
  async mget(keys) {
    if (this.connected && this.client) {
      try {
        const prefixedKeys = keys.map(k => this.options.keyPrefix + k);
        const values = await this.circuitBreaker.execute(async () => {
          return await this.client.mget(...prefixedKeys);
        });
        return values.map(v => v ? JSON.parse(v) : null);
      } catch (error) {
        console.error('[Redis] Mget error:', error.message);
        this.metrics.errors++;
      }
    }

    return keys.map(k => this.getFromMemory(k));
  }

  /**
   * Flush all keys
   */
  async flushall() {
    if (this.connected && this.client) {
      try {
        await this.circuitBreaker.execute(async () => {
          await this.client.flushall();
        });
      } catch (error) {
        console.error('[Redis] Flushall error:', error.message);
        this.metrics.errors++;
      }
    }

    this.memoryCache.clear();
    this.memoryCacheTTL.clear();
  }

  /**
   * Get from in-memory cache
   */
  getFromMemory(key) {
    this.metrics.fallbacks++;

    const ttl = this.memoryCacheTTL.get(key);
    if (ttl && Date.now() > ttl) {
      this.memoryCache.delete(key);
      this.memoryCacheTTL.delete(key);
      this.metrics.misses++;
      return null;
    }

    const value = this.memoryCache.get(key);
    if (value !== undefined) {
      this.metrics.hits++;
      return value;
    }

    this.metrics.misses++;
    return null;
  }

  /**
   * Set in in-memory cache
   */
  setInMemory(key, value, ttl = null) {
    this.metrics.fallbacks++;
    this.memoryCache.set(key, value);

    if (ttl) {
      this.memoryCacheTTL.set(key, Date.now() + (ttl * 1000));
    }
  }

  /**
   * Start memory cache cleanup interval
   */
  startMemoryCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, expiry] of this.memoryCacheTTL.entries()) {
        if (now > expiry) {
          this.memoryCache.delete(key);
          this.memoryCacheTTL.delete(key);
        }
      }
    }, 60000); // Cleanup every minute
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.metrics.hits + this.metrics.misses;
    return {
      connected: this.connected,
      mode: this.options.enableCluster ? 'cluster' : 'standalone',
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      hitRate: total > 0 ? (this.metrics.hits / total * 100).toFixed(2) + '%' : '0%',
      errors: this.metrics.errors,
      fallbacks: this.metrics.fallbacks,
      memoryCacheSize: this.memoryCache.size,
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    if (!this.connected || !this.client) {
      return {
        status: 'degraded',
        message: 'Using in-memory cache',
      };
    }

    try {
      await this.client.ping();
      return {
        status: 'healthy',
        message: 'Redis connection active',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
      };
    }
  }

  /**
   * Close connection
   */
  async close() {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

// Singleton instance
let redisClientInstance = null;

/**
 * Get Redis client singleton
 */
function getRedisClient(options = {}) {
  if (!redisClientInstance) {
    redisClientInstance = new RedisClusterClient(options);
  }
  return redisClientInstance;
}

module.exports = {
  RedisClusterClient,
  getRedisClient,
};
