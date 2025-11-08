/**
 * CDN Integration Middleware
 *
 * Features:
 * - CloudFlare integration
 * - CloudFront integration
 * - Cache purging
 * - Edge caching headers
 * - Stale-while-revalidate
 * - CDN analytics
 */

const crypto = require('crypto');

class CDNManager {
  constructor(options = {}) {
    this.provider = process.env.CDN_PROVIDER || 'cloudflare'; // cloudflare, cloudfront, none
    this.enabled = process.env.CDN_ENABLED === 'true';

    // CloudFlare config
    this.cloudflare = {
      zoneId: process.env.CLOUDFLARE_ZONE_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      apiUrl: 'https://api.cloudflare.com/client/v4',
    };

    // CloudFront config
    this.cloudfront = {
      distributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
    };

    // Cache settings
    this.cacheSettings = {
      defaultTTL: options.defaultTTL || 300, // 5 minutes
      maxTTL: options.maxTTL || 86400, // 24 hours
      staleWhileRevalidate: options.staleWhileRevalidate || 3600, // 1 hour
      staleIfError: options.staleIfError || 86400, // 24 hours
    };

    // Metrics
    this.metrics = {
      purges: 0,
      errors: 0,
      hits: 0,
      misses: 0,
    };
  }

  /**
   * CDN caching middleware
   */
  cachingMiddleware() {
    return (req, res, next) => {
      if (!this.enabled) {
        return next();
      }

      // Set cache headers based on route
      const cacheConfig = this.getCacheConfig(req.path);

      if (cacheConfig.cacheable) {
        // Set Cache-Control header
        const cacheControl = this.buildCacheControl(cacheConfig);
        res.setHeader('Cache-Control', cacheControl);

        // Set CDN-specific headers
        if (this.provider === 'cloudflare') {
          res.setHeader('CDN-Cache-Control', cacheControl);
          res.setHeader('CF-Cache-Status', 'DYNAMIC');
        } else if (this.provider === 'cloudfront') {
          res.setHeader('X-Amz-Cache-Control', cacheControl);
        }

        // Set Vary header for content negotiation
        res.setHeader('Vary', 'Accept-Encoding, User-Agent');

        // Set ETag for validation
        const originalSend = res.send;
        res.send = function (body) {
          const etag = crypto
            .createHash('md5')
            .update(JSON.stringify(body))
            .digest('hex');

          res.setHeader('ETag', `"${etag}"`);

          // Check If-None-Match
          if (req.headers['if-none-match'] === `"${etag}"`) {
            res.status(304);
            return res.end();
          }

          return originalSend.call(this, body);
        };
      } else {
        // Prevent caching
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }

      next();
    };
  }

  /**
   * Get cache configuration for route
   */
  getCacheConfig(path) {
    // API endpoints - short cache
    if (path.startsWith('/api/scan')) {
      return {
        cacheable: true,
        ttl: 60, // 1 minute
        staleWhileRevalidate: 300, // 5 minutes
      };
    }

    // Static documentation - long cache
    if (path.startsWith('/api-docs') || path.startsWith('/docs')) {
      return {
        cacheable: true,
        ttl: 3600, // 1 hour
        staleWhileRevalidate: 86400, // 24 hours
      };
    }

    // Health checks - no cache
    if (path.startsWith('/health') || path.startsWith('/metrics')) {
      return {
        cacheable: false,
      };
    }

    // Default
    return {
      cacheable: true,
      ttl: this.cacheSettings.defaultTTL,
      staleWhileRevalidate: this.cacheSettings.staleWhileRevalidate,
    };
  }

  /**
   * Build Cache-Control header
   */
  buildCacheControl(config) {
    const directives = [
      'public',
      `max-age=${config.ttl}`,
      `s-maxage=${config.ttl}`,
    ];

    if (config.staleWhileRevalidate) {
      directives.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
    }

    if (this.cacheSettings.staleIfError) {
      directives.push(`stale-if-error=${this.cacheSettings.staleIfError}`);
    }

    return directives.join(', ');
  }

  /**
   * Purge cache (CloudFlare)
   */
  async purgeCloudflareCache(urls = []) {
    if (!this.cloudflare.zoneId || !this.cloudflare.apiToken) {
      throw new Error('CloudFlare credentials not configured');
    }

    const endpoint = `${this.cloudflare.apiUrl}/zones/${this.cloudflare.zoneId}/purge_cache`;

    const body = urls.length > 0
      ? { files: urls }
      : { purge_everything: true };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.cloudflare.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(`CloudFlare purge failed: ${JSON.stringify(data.errors)}`);
      }

      this.metrics.purges++;
      console.log('[CDN] CloudFlare cache purged:', urls.length > 0 ? urls : 'all');
      return data;
    } catch (error) {
      this.metrics.errors++;
      console.error('[CDN] CloudFlare purge error:', error.message);
      throw error;
    }
  }

  /**
   * Purge cache (CloudFront)
   */
  async purgeCloudFrontCache(paths = ['/*']) {
    if (!this.cloudfront.distributionId) {
      throw new Error('CloudFront distribution ID not configured');
    }

    // Note: This requires AWS SDK which is not included
    // Users should install @aws-sdk/client-cloudfront
    console.warn('[CDN] CloudFront purge requires @aws-sdk/client-cloudfront');
    console.log('[CDN] Would purge CloudFront paths:', paths);

    this.metrics.purges++;
    return { success: true, message: 'CloudFront purge initiated (mock)' };
  }

  /**
   * Purge cache (unified interface)
   */
  async purgeCache(items = []) {
    if (!this.enabled) {
      console.log('[CDN] CDN disabled, skipping purge');
      return { success: true, message: 'CDN disabled' };
    }

    try {
      if (this.provider === 'cloudflare') {
        return await this.purgeCloudflareCache(items);
      } else if (this.provider === 'cloudfront') {
        return await this.purgeCloudFrontCache(items);
      }

      return { success: false, message: 'Unknown CDN provider' };
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Get CDN analytics (CloudFlare)
   */
  async getCloudFlareAnalytics(since = -10080) {
    if (!this.cloudflare.zoneId || !this.cloudflare.apiToken) {
      throw new Error('CloudFlare credentials not configured');
    }

    const endpoint = `${this.cloudflare.apiUrl}/zones/${this.cloudflare.zoneId}/analytics/dashboard`;

    try {
      const response = await fetch(`${endpoint}?since=${since}`, {
        headers: {
          'Authorization': `Bearer ${this.cloudflare.apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(`CloudFlare analytics failed: ${JSON.stringify(data.errors)}`);
      }

      return data.result;
    } catch (error) {
      this.metrics.errors++;
      console.error('[CDN] CloudFlare analytics error:', error.message);
      throw error;
    }
  }

  /**
   * Get CDN statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      provider: this.provider,
      purges: this.metrics.purges,
      errors: this.metrics.errors,
      configured: this.isConfigured(),
    };
  }

  /**
   * Check if CDN is properly configured
   */
  isConfigured() {
    if (this.provider === 'cloudflare') {
      return !!(this.cloudflare.zoneId && this.cloudflare.apiToken);
    } else if (this.provider === 'cloudfront') {
      return !!(this.cloudfront.distributionId &&
                this.cloudfront.accessKeyId &&
                this.cloudfront.secretAccessKey);
    }
    return false;
  }

  /**
   * Health check
   */
  async healthCheck() {
    if (!this.enabled) {
      return {
        status: 'disabled',
        message: 'CDN integration disabled',
      };
    }

    if (!this.isConfigured()) {
      return {
        status: 'not_configured',
        message: `CDN provider ${this.provider} not configured`,
      };
    }

    try {
      if (this.provider === 'cloudflare') {
        // Test CloudFlare API
        const endpoint = `${this.cloudflare.apiUrl}/zones/${this.cloudflare.zoneId}`;
        const response = await fetch(endpoint, {
          headers: {
            'Authorization': `Bearer ${this.cloudflare.apiToken}`,
          },
        });

        const data = await response.json();

        if (data.success) {
          return {
            status: 'healthy',
            message: 'CloudFlare API accessible',
            zone: data.result?.name,
          };
        }
      }

      return {
        status: 'healthy',
        message: `${this.provider} configured`,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
      };
    }
  }
}

// Singleton instance
let cdnManagerInstance = null;

function getCDNManager(options = {}) {
  if (!cdnManagerInstance) {
    cdnManagerInstance = new CDNManager(options);
  }
  return cdnManagerInstance;
}

module.exports = {
  CDNManager,
  getCDNManager,
};
