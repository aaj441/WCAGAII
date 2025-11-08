/**
 * Keyword-Based Scanning Routes (v4.0)
 *
 * New API endpoints for keyword-driven accessibility discovery.
 *
 * Endpoints:
 * - POST /api/v4/scan/keywords - Discover and scan sites by keywords
 * - GET /api/v4/batch/:id - Get batch scan status
 * - GET /api/v4/benchmark/:vertical - Get industry benchmark
 * - POST /api/v4/compare - Compare site to industry
 * - GET /api/v4/verticals - List available verticals
 * - GET /api/v4/stats - Get v4.0 service statistics
 */

const express = require('express');
const router = express.Router();

const { getKeywordDiscoveryService } = require('../services/keywordDiscovery');
const { getBatchScanner } = require('../services/batchScanner');
const { getBenchmarkingService } = require('../services/benchmarking');
const { getGrokAIService } = require('../services/grokAI');
const { getAvailableVerticals } = require('../config/verticals');

const discoveryService = getKeywordDiscoveryService();
const batchScanner = getBatchScanner();
const benchmarking = getBenchmarkingService();
const grokAI = getGrokAIService();

/**
 * @swagger
 * /api/v4/scan/keywords:
 *   post:
 *     summary: Discover and scan websites by keywords
 *     tags: [v4.0 Keyword Scanning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - keywords
 *             properties:
 *               keywords:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Search keywords
 *                 example: ["fintech", "mobile banking"]
 *               vertical:
 *                 type: string
 *                 description: Industry vertical
 *                 example: finance
 *               limit:
 *                 type: number
 *                 description: Number of sites to discover
 *                 default: 20
 *               enableAI:
 *                 type: boolean
 *                 description: Enable Grok AI remediation
 *                 default: true
 *               includeBenchmark:
 *                 type: boolean
 *                 description: Include industry benchmark comparison
 *                 default: true
 *     responses:
 *       200:
 *         description: Keyword scan results
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post('/scan/keywords', async (req, res) => {
  try {
    const {
      keywords = [],
      vertical = 'general',
      limit = 20,
      enableAI = true,
      includeBenchmark = true,
      engine = 'google',
    } = req.body;

    // Validation
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Keywords array is required',
      });
    }

    if (keywords.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 5 keywords allowed',
      });
    }

    if (limit > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 sites allowed per batch',
      });
    }

    console.log(`[v4.0] Keyword scan: ${keywords.join(', ')} [${vertical}]`);

    // Step 1: Discover websites
    const discoveredSites = await discoveryService.discover({
      keywords,
      vertical,
      limit,
      engine,
    });

    if (discoveredSites.length === 0) {
      return res.json({
        success: true,
        vertical,
        keywords,
        sitesDiscovered: 0,
        message: 'No sites discovered for these keywords',
      });
    }

    // Step 2: Batch scan discovered sites
    const batchResult = await batchScanner.scanBatch(discoveredSites, {
      vertical,
      enableAI,
      cacheResults: true,
    });

    // Step 3: Get industry benchmark (if requested)
    let benchmark = null;
    let comparison = null;

    if (includeBenchmark) {
      benchmark = await benchmarking.getIndustryBenchmark(vertical);

      // Compare aggregate to benchmark
      if (batchResult.aggregate) {
        comparison = {
          yourAverage: batchResult.aggregate.averageScore,
          industryAverage: benchmark.averageScore,
          percentile: benchmarking.calculatePercentile(
            batchResult.aggregate.averageScore,
            benchmark
          ),
          comparison: benchmarking.getComparisonText(
            batchResult.aggregate.averageScore,
            benchmark.averageScore
          ),
        };
      }
    }

    // Build response
    const response = {
      success: true,
      version: '4.0',
      vertical,
      keywords,

      // Discovery
      sitesDiscovered: discoveredSites.length,
      sitesScanned: batchResult.totalSites,
      successfulScans: batchResult.aggregate?.successfulScans || 0,
      failedScans: batchResult.aggregate?.failedScans || 0,

      // Aggregate results
      aggregate: batchResult.aggregate,

      // Individual results (top 10 only in response)
      topSites: batchResult.results
        .filter(r => r.success)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 10)
        .map(r => ({
          url: r.url,
          domain: r.domain,
          title: r.title,
          score: r.score,
          violationsCount: r.violationsCount,
          passed: r.passed,
        })),

      // Benchmarking
      benchmark: includeBenchmark ? benchmark : undefined,
      comparison: includeBenchmark ? comparison : undefined,

      // AI insights
      aiInsights: enableAI ? batchResult.aiInsights : undefined,

      // Batch metadata
      batchId: batchResult.id,
      duration: batchResult.duration,
      timestamp: new Date().toISOString(),
    };

    // Record scans for benchmarking
    batchResult.results.filter(r => r.success).forEach(result => {
      benchmarking.recordScan(result).catch(err =>
        console.error('[v4.0] Failed to record scan:', err.message)
      );
    });

    res.json(response);
  } catch (error) {
    console.error('[v4.0] Keyword scan error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v4/batch/{id}:
 *   get:
 *     summary: Get batch scan status and results
 *     tags: [v4.0 Keyword Scanning]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *     responses:
 *       200:
 *         description: Batch status and results
 *       404:
 *         description: Batch not found
 */
router.get('/batch/:id', (req, res) => {
  const { id } = req.params;

  const batch = batchScanner.getBatchStatus(id);

  if (!batch) {
    return res.status(404).json({
      success: false,
      error: 'Batch not found',
    });
  }

  res.json({
    success: true,
    batch,
  });
});

/**
 * @swagger
 * /api/v4/benchmark/{vertical}:
 *   get:
 *     summary: Get industry benchmark for vertical
 *     tags: [v4.0 Benchmarking]
 *     parameters:
 *       - in: path
 *         name: vertical
 *         required: true
 *         schema:
 *           type: string
 *         description: Industry vertical
 *         example: finance
 *     responses:
 *       200:
 *         description: Industry benchmark data
 */
router.get('/benchmark/:vertical', async (req, res) => {
  try {
    const { vertical } = req.params;

    const benchmark = await benchmarking.getIndustryBenchmark(vertical);

    res.json({
      success: true,
      benchmark,
    });
  } catch (error) {
    console.error('[v4.0] Benchmark error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v4/compare:
 *   post:
 *     summary: Compare site to industry benchmark
 *     tags: [v4.0 Benchmarking]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - score
 *               - vertical
 *             properties:
 *               score:
 *                 type: number
 *                 description: Site accessibility score
 *                 example: 85
 *               vertical:
 *                 type: string
 *                 description: Industry vertical
 *                 example: finance
 *     responses:
 *       200:
 *         description: Comparison results
 */
router.post('/compare', async (req, res) => {
  try {
    const { score, vertical = 'general' } = req.body;

    if (typeof score !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Score is required',
      });
    }

    const comparison = await benchmarking.compareToBenchmark(
      { score },
      vertical
    );

    res.json({
      success: true,
      comparison,
    });
  } catch (error) {
    console.error('[v4.0] Compare error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/v4/verticals:
 *   get:
 *     summary: Get available industry verticals
 *     tags: [v4.0 Keyword Scanning]
 *     responses:
 *       200:
 *         description: List of verticals
 */
router.get('/verticals', (req, res) => {
  const verticals = getAvailableVerticals();

  res.json({
    success: true,
    verticals,
  });
});

/**
 * @swagger
 * /api/v4/stats:
 *   get:
 *     summary: Get v4.0 service statistics
 *     tags: [v4.0 Keyword Scanning]
 *     responses:
 *       200:
 *         description: Service statistics
 */
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    version: '4.0',
    services: {
      discovery: discoveryService.getStats(),
      batchScanner: batchScanner.getStats(),
      grokAI: grokAI.getStats(),
    },
  });
});

/**
 * @swagger
 * /api/v4/health:
 *   get:
 *     summary: Health check for v4.0 services
 *     tags: [v4.0 Keyword Scanning]
 *     responses:
 *       200:
 *         description: Service health status
 */
router.get('/health', async (req, res) => {
  const health = {
    version: '4.0',
    timestamp: new Date().toISOString(),
    services: {
      discovery: await discoveryService.healthCheck(),
      grokAI: await grokAI.healthCheck(),
    },
  };

  const allHealthy = Object.values(health.services).every(
    s => s.status === 'healthy'
  );

  res.status(allHealthy ? 200 : 503).json(health);
});

module.exports = router;
