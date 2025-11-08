/**
 * Caching Middleware
 *
 * Features:
 * - Response caching with Redis
 * - Cache key generation
 * - Conditional caching based on status codes
 * - Cache headers (ETag, Cache-Control)
 * - Idempotency support
 */

const crypto = require('crypto');
const { getRedisClient } = require('../services/redisClient');

/**
 * Generate cache key from request
 */
function generateCacheKey(req) {
  const parts = [
    req.method,
    req.path,
    JSON.stringify(req.query),
    JSON.stringify(req.body),
  ];

  const hash = crypto
    .createHash('sha256')
    .update(parts.join(':'))
    .digest('hex');

  return `cache:${hash}`;
}

/**
 * Response caching middleware
 */
function cacheMiddleware(options = {}) {
  const redis = getRedisClient();
  const defaultTTL = options.ttl || 300; // 5 minutes default
  const cacheableMethods = options.methods || ['GET', 'HEAD'];
  const cacheableStatuses = options.statuses || [200, 203, 204, 206, 300, 301, 404, 405, 410, 414, 501];

  return async (req, res, next) => {
    // Skip if method not cacheable
    if (!cacheableMethods.includes(req.method)) {
      return next();
    }

    // Skip if cache disabled
    const cacheControl = req.headers['cache-control'];
    if (cacheControl === 'no-cache' || cacheControl === 'no-store') {
      return next();
    }

    const cacheKey = generateCacheKey(req);

    // Try to get from cache
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[Cache] HIT: ${cacheKey}`);

        // Set cache headers
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);

        // Set ETag
        if (cached.etag) {
          res.setHeader('ETag', cached.etag);
        }

        // Check If-None-Match
        if (req.headers['if-none-match'] === cached.etag) {
          return res.status(304).end();
        }

        // Return cached response
        res.status(cached.status);
        Object.entries(cached.headers || {}).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
        return res.send(cached.body);
      }

      console.log(`[Cache] MISS: ${cacheKey}`);
      res.setHeader('X-Cache', 'MISS');
    } catch (error) {
      console.error('[Cache] Error reading cache:', error.message);
    }

    // Capture response
    const originalSend = res.send;
    const originalJson = res.json;

    res.send = function (body) {
      cacheResponse(res.statusCode, body);
      return originalSend.call(this, body);
    };

    res.json = function (body) {
      cacheResponse(res.statusCode, body);
      return originalJson.call(this, body);
    };

    async function cacheResponse(statusCode, body) {
      // Only cache successful responses
      if (!cacheableStatuses.includes(statusCode)) {
        return;
      }

      // Generate ETag
      const etag = crypto
        .createHash('md5')
        .update(JSON.stringify(body))
        .digest('hex');

      const cacheData = {
        status: statusCode,
        headers: {
          'Content-Type': res.getHeader('Content-Type') || 'application/json',
          'ETag': etag,
        },
        body,
        etag,
        cachedAt: new Date().toISOString(),
      };

      try {
        await redis.set(cacheKey, cacheData, defaultTTL);
        console.log(`[Cache] STORED: ${cacheKey} (TTL: ${defaultTTL}s)`);
      } catch (error) {
        console.error('[Cache] Error storing cache:', error.message);
      }
    }

    next();
  };
}

/**
 * Idempotency middleware
 */
function idempotencyMiddleware() {
  const redis = getRedisClient();
  const ttl = 86400; // 24 hours

  return async (req, res, next) => {
    // Only for POST, PUT, PATCH, DELETE
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      return next();
    }

    const cacheKey = `idempotency:${idempotencyKey}`;

    try {
      // Check if request already processed
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[Idempotency] Request already processed: ${idempotencyKey}`);
        res.setHeader('X-Idempotency-Replay', 'true');
        res.status(cached.status);
        Object.entries(cached.headers || {}).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
        return res.send(cached.body);
      }

      // Capture response
      const originalSend = res.send;
      const originalJson = res.json;

      res.send = function (body) {
        storeIdempotencyResponse(res.statusCode, body);
        return originalSend.call(this, body);
      };

      res.json = function (body) {
        storeIdempotencyResponse(res.statusCode, body);
        return originalJson.call(this, body);
      };

      async function storeIdempotencyResponse(statusCode, body) {
        const responseData = {
          status: statusCode,
          headers: {
            'Content-Type': res.getHeader('Content-Type') || 'application/json',
          },
          body,
          processedAt: new Date().toISOString(),
        };

        try {
          await redis.set(cacheKey, responseData, ttl);
          console.log(`[Idempotency] Stored: ${idempotencyKey}`);
        } catch (error) {
          console.error('[Idempotency] Error storing:', error.message);
        }
      }

      next();
    } catch (error) {
      console.error('[Idempotency] Error:', error.message);
      next();
    }
  };
}

/**
 * Cache invalidation helper
 */
async function invalidateCache(pattern) {
  const redis = getRedisClient();
  try {
    await redis.delete(pattern);
    console.log(`[Cache] Invalidated: ${pattern}`);
  } catch (error) {
    console.error('[Cache] Invalidation error:', error.message);
  }
}

module.exports = {
  cacheMiddleware,
  idempotencyMiddleware,
  invalidateCache,
  generateCacheKey,
};
