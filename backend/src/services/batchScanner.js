/**
 * Batch Scanner Service
 *
 * Handles scanning multiple URLs discovered from keywords.
 * Optimized for vertical-specific scanning with intelligent queueing.
 *
 * Features:
 * - Parallel scanning with concurrency control
 * - Vertical-specific rule sets
 * - Progress tracking
 * - Error recovery
 * - Result aggregation
 * - Redis caching
 */

const { scanURL, scanHTML } = require('../scanner');
const { getVerticalTags, calculateVerticalScore } = require('../config/verticals');
const { getGrokAIService } = require('./grokAI');
const { getRedisClient } = require('./redisClient');
const { getBrowserPool } = require('./browserPool');

class BatchScannerService {
  constructor() {
    this.redis = getRedisClient();
    this.grokAI = getGrokAIService();
    this.browserPool = getBrowserPool();

    // Configuration
    this.maxConcurrent = parseInt(process.env.BATCH_MAX_CONCURRENT) || 5;
    this.scanTimeout = parseInt(process.env.BATCH_SCAN_TIMEOUT) || 30000;

    // Active batches
    this.batches = new Map();

    // Metrics
    this.metrics = {
      batchesStarted: 0,
      batchesCompleted: 0,
      totalScans: 0,
      successfulScans: 0,
      failedScans: 0,
    };
  }

  /**
   * Scan multiple URLs from keyword discovery
   */
  async scanBatch(sites, options = {}) {
    const {
      vertical = 'general',
      enableAI = true,
      includeScreenshots = false,
      cacheResults = true,
      batchId = this.generateBatchId(),
    } = options;

    this.metrics.batchesStarted++;

    const batch = {
      id: batchId,
      vertical,
      totalSites: sites.length,
      completedSites: 0,
      results: [],
      startTime: Date.now(),
      status: 'running',
    };

    this.batches.set(batchId, batch);

    try {
      // Scan sites in parallel (with concurrency limit)
      const results = await this.scanWithConcurrency(
        sites,
        vertical,
        {
          enableAI,
          includeScreenshots,
          cacheResults,
          onProgress: (completed) => {
            batch.completedSites = completed;
            batch.progress = Math.round((completed / sites.length) * 100);
          },
        }
      );

      batch.results = results;
      batch.status = 'completed';
      batch.completedTime = Date.now();
      batch.duration = batch.completedTime - batch.startTime;

      // Generate aggregate statistics
      batch.aggregate = this.aggregateResults(results, vertical);

      // Generate AI insights if enabled
      if (enableAI) {
        batch.aiInsights = await this.generateBatchInsights(results, vertical);
      }

      this.metrics.batchesCompleted++;

      return batch;
    } catch (error) {
      batch.status = 'failed';
      batch.error = error.message;
      throw error;
    }
  }

  /**
   * Scan with concurrency control
   */
  async scanWithConcurrency(sites, vertical, options = {}) {
    const {
      enableAI = true,
      includeScreenshots = false,
      cacheResults = true,
      onProgress = () => {},
    } = options;

    const queue = [...sites];
    const results = [];
    const running = [];
    let completed = 0;

    while (queue.length > 0 || running.length > 0) {
      // Start new scans up to concurrency limit
      while (running.length < this.maxConcurrent && queue.length > 0) {
        const site = queue.shift();
        const promise = this.scanSite(site, vertical, {
          enableAI,
          includeScreenshots,
          cacheResults,
        })
          .then(result => {
            completed++;
            this.metrics.totalScans++;
            this.metrics.successfulScans++;
            results.push(result);
            onProgress(completed);
          })
          .catch(error => {
            completed++;
            this.metrics.totalScans++;
            this.metrics.failedScans++;
            results.push({
              url: site.url,
              success: false,
              error: error.message,
              vertical,
            });
            onProgress(completed);
          })
          .finally(() => {
            const index = running.indexOf(promise);
            if (index > -1) {
              running.splice(index, 1);
            }
          });

        running.push(promise);
      }

      // Wait for at least one scan to complete
      if (running.length > 0) {
        await Promise.race(running);
      }
    }

    return results;
  }

  /**
   * Scan individual site with vertical-specific settings
   */
  async scanSite(site, vertical, options = {}) {
    const { url, domain, title } = site;
    const { enableAI, includeScreenshots, cacheResults } = options;

    const startTime = Date.now();

    try {
      // Check cache first
      if (cacheResults) {
        const cacheKey = `scan:${vertical}:${url}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          console.log(`[BatchScanner] Cache HIT for ${url}`);
          return {
            ...cached,
            cached: true,
          };
        }
      }

      // Get vertical-specific tags
      const tags = getVerticalTags(vertical);

      // Perform scan with vertical configuration
      const axeResults = await scanURL(url, {
        timeout: this.scanTimeout,
        tags,
      });

      // Calculate vertical-weighted score
      const scoreData = calculateVerticalScore(axeResults.violations, vertical);

      // Build result
      const result = {
        url,
        domain,
        title,
        vertical,
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,

        // Axe results
        violations: axeResults.violations,
        passes: axeResults.passes,
        incomplete: axeResults.incomplete,

        // Counts
        violationsCount: axeResults.violations.length,
        passesCount: axeResults.passes.length,
        incompleteCount: axeResults.incomplete.length,

        // Vertical scoring
        score: scoreData.score,
        requiredScore: scoreData.requiredScore,
        passed: scoreData.passed,

        // Metadata
        metadata: {
          engine: 'axe-core',
          version: '4.10.2',
          wcagLevel: 'AA',
          vertical,
        },
      };

      // Generate AI remediation if enabled
      if (enableAI && result.violations.length > 0) {
        result.aiRemediation = await this.grokAI.generateRemediation(
          result.violations,
          { vertical, url }
        );
      }

      // Cache result (1 hour TTL for batch scans)
      if (cacheResults) {
        const cacheKey = `scan:${vertical}:${url}`;
        await this.redis.set(cacheKey, result, 3600);
      }

      return result;
    } catch (error) {
      console.error(`[BatchScanner] Scan failed for ${url}:`, error.message);
      return {
        url,
        domain,
        title,
        vertical,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Aggregate results for batch
   */
  aggregateResults(results, vertical) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (successful.length === 0) {
      return {
        totalSites: results.length,
        successfulScans: 0,
        failedScans: failed.length,
        error: 'All scans failed',
      };
    }

    // Aggregate violations
    const allViolations = successful.flatMap(r => r.violations || []);
    const violationCounts = {};

    allViolations.forEach(v => {
      violationCounts[v.id] = (violationCounts[v.id] || 0) + 1;
    });

    // Sort by frequency
    const topViolations = Object.entries(violationCounts)
      .map(([rule, count]) => ({
        rule,
        count,
        percentage: Math.round((count / successful.length) * 100),
        description: allViolations.find(v => v.id === rule)?.description || '',
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate average scores
    const scores = successful.map(r => r.score || 0);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Calculate pass rate
    const passedCount = successful.filter(r => r.passed).length;
    const passRate = (passedCount / successful.length) * 100;

    return {
      vertical,
      totalSites: results.length,
      successfulScans: successful.length,
      failedScans: failed.length,

      // Scores
      averageScore: Math.round(avgScore * 10) / 10,
      requiredScore: successful[0]?.requiredScore || 80,
      passRate: Math.round(passRate * 10) / 10,

      // Violations
      totalViolations: allViolations.length,
      averageViolationsPerSite: Math.round(allViolations.length / successful.length * 10) / 10,
      topViolations,

      // Site breakdown
      bestSite: this.findBestSite(successful),
      worstSite: this.findWorstSite(successful),
    };
  }

  /**
   * Find best performing site
   */
  findBestSite(results) {
    if (results.length === 0) return null;

    const best = results.reduce((best, current) =>
      (current.score || 0) > (best.score || 0) ? current : best
    );

    return {
      url: best.url,
      domain: best.domain,
      score: best.score,
      violationsCount: best.violationsCount,
    };
  }

  /**
   * Find worst performing site
   */
  findWorstSite(results) {
    if (results.length === 0) return null;

    const worst = results.reduce((worst, current) =>
      (current.score || 100) < (worst.score || 100) ? current : worst
    );

    return {
      url: worst.url,
      domain: worst.domain,
      score: worst.score,
      violationsCount: worst.violationsCount,
    };
  }

  /**
   * Generate AI insights for batch
   */
  async generateBatchInsights(results, vertical) {
    const successful = results.filter(r => r.success);
    if (successful.length === 0) return null;

    // Collect all unique violations
    const allViolations = [];
    const violationMap = new Map();

    successful.forEach(result => {
      (result.violations || []).forEach(v => {
        if (!violationMap.has(v.id)) {
          violationMap.set(v.id, v);
          allViolations.push(v);
        }
      });
    });

    // Generate industry-wide insights
    return await this.grokAI.generateRemediation(allViolations, {
      vertical,
      url: `Batch analysis of ${successful.length} ${vertical} sites`,
      includeCodeExamples: false, // High-level insights only
    });
  }

  /**
   * Get batch status
   */
  getBatchStatus(batchId) {
    return this.batches.get(batchId) || null;
  }

  /**
   * Generate batch ID
   */
  generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      batchesStarted: this.metrics.batchesStarted,
      batchesCompleted: this.metrics.batchesCompleted,
      totalScans: this.metrics.totalScans,
      successfulScans: this.metrics.successfulScans,
      failedScans: this.metrics.failedScans,
      successRate: this.metrics.totalScans > 0
        ? `${Math.round((this.metrics.successfulScans / this.metrics.totalScans) * 100)}%`
        : '0%',
      activeBatches: this.batches.size,
    };
  }

  /**
   * Clean up old batches
   */
  cleanup(maxAge = 3600000) {
    const now = Date.now();
    for (const [id, batch] of this.batches.entries()) {
      if (batch.status !== 'running' && (now - batch.startTime) > maxAge) {
        this.batches.delete(id);
      }
    }
  }
}

// Singleton instance
let batchScannerInstance = null;

function getBatchScanner() {
  if (!batchScannerInstance) {
    batchScannerInstance = new BatchScannerService();
    // Cleanup old batches every 10 minutes
    setInterval(() => batchScannerInstance.cleanup(), 600000);
  }
  return batchScannerInstance;
}

module.exports = {
  BatchScannerService,
  getBatchScanner,
};
