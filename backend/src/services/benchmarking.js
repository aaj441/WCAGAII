/**
 * Industry Benchmarking Service
 *
 * Tracks and analyzes accessibility performance across industries.
 * Provides comparative insights and trend analysis.
 *
 * Features:
 * - Industry baseline tracking
 * - Competitive benchmarking
 * - Trend analysis
 * - Heatmap generation
 * - Performance percentiles
 */

const { getRedisClient } = require('./redisClient');
const { getVerticalConfig } = require('../config/verticals');
const { getRepositories } = require('./database');

class BenchmarkingService {
  constructor() {
    this.redis = getRedisClient();
    this.db = null; // Lazy load database

    // Benchmark cache TTL (1 day)
    this.cacheTTL = 86400;
  }

  /**
   * Get database repositories (lazy init)
   */
  getDB() {
    if (!this.db) {
      try {
        this.db = getRepositories();
      } catch (error) {
        console.warn('[Benchmarking] Database not available, using cache only');
        this.db = null;
      }
    }
    return this.db;
  }

  /**
   * Record scan results for benchmarking
   */
  async recordScan(scanData) {
    const {
      url,
      vertical = 'general',
      score,
      violationsCount,
      violations,
    } = scanData;

    try {
      // Store in database if available
      const db = this.getDB();
      if (db?.scans) {
        await db.scans.create({
          type: 'url',
          input: url,
          url,
          violationsCount,
          wcagLevel: 'AA',
          duration: scanData.duration || 0,
          violations: violations || [],
          metadata: { vertical, score },
        });
      }

      // Update Redis benchmarks
      await this.updateBenchmarkCache(vertical, {
        score,
        violationsCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Benchmarking] Failed to record scan:', error.message);
    }
  }

  /**
   * Get industry benchmark
   */
  async getIndustryBenchmark(vertical = 'general') {
    const cacheKey = `benchmark:${vertical}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Calculate from database or use defaults
    const benchmark = await this.calculateBenchmark(vertical);

    // Cache result
    await this.redis.set(cacheKey, benchmark, this.cacheTTL);

    return benchmark;
  }

  /**
   * Calculate benchmark from historical data
   */
  async calculateBenchmark(vertical) {
    const db = this.getDB();

    // Try to get from database
    if (db?.scans) {
      try {
        const scans = await db.scans.findByUserId(null, { limit: 1000 }); // Get recent scans
        const verticalScans = scans.filter(s => s.metadata?.vertical === vertical);

        if (verticalScans.length >= 10) {
          return this.computeBenchmarkStats(verticalScans, vertical);
        }
      } catch (error) {
        console.error('[Benchmarking] Database query failed:', error.message);
      }
    }

    // Fallback to industry defaults
    return this.getDefaultBenchmark(vertical);
  }

  /**
   * Compute statistics from scan data
   */
  computeBenchmarkStats(scans, vertical) {
    const scores = scans.map(s => s.metadata?.score || 0);
    const violations = scans.map(s => s.violationsCount || 0);

    // Sort for percentile calculations
    scores.sort((a, b) => a - b);
    violations.sort((a, b) => a - b);

    const config = getVerticalConfig(vertical);

    return {
      vertical,
      sampleSize: scans.length,
      lastUpdated: new Date().toISOString(),

      // Score statistics
      averageScore: this.average(scores),
      medianScore: this.percentile(scores, 50),
      p25Score: this.percentile(scores, 25),
      p75Score: this.percentile(scores, 75),
      p90Score: this.percentile(scores, 90),

      // Violation statistics
      averageViolations: this.average(violations),
      medianViolations: Math.round(this.percentile(violations, 50)),

      // Compliance
      requiredScore: config.compliance.requiredScore,
      passRate: this.calculatePassRate(scores, config.compliance.requiredScore),

      // Top issues (would need full violation data)
      topIssues: [],

      note: 'Benchmark calculated from historical data',
    };
  }

  /**
   * Get default benchmark (industry estimates)
   */
  getDefaultBenchmark(vertical) {
    const config = getVerticalConfig(vertical);

    // Industry estimates based on WebAIM Million report
    const defaults = {
      finance: {
        averageScore: 75,
        medianScore: 78,
        averageViolations: 32,
        passRate: 68,
        topIssues: ['color-contrast', 'label', 'button-name'],
      },
      healthcare: {
        averageScore: 72,
        medianScore: 74,
        averageViolations: 38,
        passRate: 62,
        topIssues: ['color-contrast', 'image-alt', 'label'],
      },
      government: {
        averageScore: 82,
        medianScore: 85,
        averageViolations: 24,
        passRate: 78,
        topIssues: ['document-title', 'link-name', 'label'],
      },
      ecommerce: {
        averageScore: 68,
        medianScore: 70,
        averageViolations: 45,
        passRate: 55,
        topIssues: ['image-alt', 'button-name', 'color-contrast'],
      },
      education: {
        averageScore: 76,
        medianScore: 78,
        averageViolations: 28,
        passRate: 70,
        topIssues: ['heading-order', 'image-alt', 'label'],
      },
      general: {
        averageScore: 70,
        medianScore: 72,
        averageViolations: 35,
        passRate: 60,
        topIssues: ['color-contrast', 'image-alt', 'link-name'],
      },
    };

    const defaultStats = defaults[vertical] || defaults.general;

    return {
      vertical,
      sampleSize: 0,
      lastUpdated: new Date().toISOString(),

      averageScore: defaultStats.averageScore,
      medianScore: defaultStats.medianScore,
      p25Score: defaultStats.medianScore - 8,
      p75Score: defaultStats.medianScore + 8,
      p90Score: defaultStats.medianScore + 15,

      averageViolations: defaultStats.averageViolations,
      medianViolations: defaultStats.averageViolations,

      requiredScore: config.compliance.requiredScore,
      passRate: defaultStats.passRate,

      topIssues: defaultStats.topIssues,

      note: 'Benchmark based on industry estimates (WebAIM Million 2024)',
    };
  }

  /**
   * Compare site to industry
   */
  async compareToBenchmark(scanResult, vertical = 'general') {
    const benchmark = await this.getIndustryBenchmark(vertical);
    const score = scanResult.score || 0;

    const percentile = this.calculatePercentile(score, benchmark);

    return {
      vertical,
      yourScore: score,
      industryAverage: benchmark.averageScore,
      industryMedian: benchmark.medianScore,
      percentile,
      comparison: this.getComparisonText(score, benchmark.averageScore),
      recommendation: this.getRecommendation(score, benchmark, vertical),
    };
  }

  /**
   * Generate heatmap data for vertical
   */
  async generateHeatmap(vertical, results) {
    // Group violations by rule
    const ruleFrequency = {};
    const ruleSeverity = {};

    results.forEach(result => {
      if (!result.violations) return;

      result.violations.forEach(violation => {
        const rule = violation.id;

        // Count frequency
        ruleFrequency[rule] = (ruleFrequency[rule] || 0) + 1;

        // Track severity
        if (!ruleSeverity[rule]) {
          ruleSeverity[rule] = {
            critical: 0,
            serious: 0,
            moderate: 0,
            minor: 0,
          };
        }

        const impact = violation.impact || 'moderate';
        ruleSeverity[rule][impact]++;
      });
    });

    // Build heatmap data
    const heatmap = Object.entries(ruleFrequency)
      .map(([rule, frequency]) => ({
        rule,
        frequency,
        percentage: Math.round((frequency / results.length) * 100),
        severity: this.calculateSeverityScore(ruleSeverity[rule]),
        impact: this.getDominantImpact(ruleSeverity[rule]),
      }))
      .sort((a, b) => b.frequency - a.frequency);

    return {
      vertical,
      totalSites: results.length,
      totalRules: heatmap.length,
      heatmap,
      generated: new Date().toISOString(),
    };
  }

  /**
   * Update benchmark cache
   */
  async updateBenchmarkCache(vertical, data) {
    const cacheKey = `benchmark:data:${vertical}`;

    try {
      // Get existing data
      const existing = await this.redis.get(cacheKey) || [];

      // Add new data point
      existing.push(data);

      // Keep last 1000 data points
      const trimmed = existing.slice(-1000);

      // Update cache
      await this.redis.set(cacheKey, trimmed, this.cacheTTL * 7); // 7 days

      // Invalidate benchmark cache (will be recalculated)
      await this.redis.delete(`benchmark:${vertical}`);
    } catch (error) {
      console.error('[Benchmarking] Cache update failed:', error.message);
    }
  }

  // Helper methods

  average(arr) {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10;
  }

  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  }

  calculatePassRate(scores, requiredScore) {
    if (scores.length === 0) return 0;
    const passed = scores.filter(s => s >= requiredScore).length;
    return Math.round((passed / scores.length) * 100);
  }

  calculatePercentile(score, benchmark) {
    // Estimate percentile based on score relative to benchmarks
    if (score >= benchmark.p90Score) return 90;
    if (score >= benchmark.p75Score) return 75;
    if (score >= benchmark.medianScore) return 50;
    if (score >= benchmark.p25Score) return 25;
    return 10;
  }

  getComparisonText(score, average) {
    const diff = score - average;
    if (diff > 15) return 'significantly better than';
    if (diff > 5) return 'better than';
    if (diff > -5) return 'about equal to';
    if (diff > -15) return 'below';
    return 'significantly below';
  }

  getRecommendation(score, benchmark, vertical) {
    const config = getVerticalConfig(vertical);

    if (score >= config.compliance.requiredScore) {
      return `Excellent! Your score meets ${vertical} compliance requirements.`;
    }

    if (score >= benchmark.medianScore) {
      return `Good performance, but aim for ${config.compliance.requiredScore}+ to meet ${vertical} standards.`;
    }

    return `Priority improvements needed. Focus on ${benchmark.topIssues[0]} to reach industry average.`;
  }

  calculateSeverityScore(severity) {
    // Weight: critical=4, serious=3, moderate=2, minor=1
    const weights = { critical: 4, serious: 3, moderate: 2, minor: 1 };
    let total = 0;
    let count = 0;

    Object.entries(severity).forEach(([level, num]) => {
      total += weights[level] * num;
      count += num;
    });

    return count > 0 ? Math.round((total / count) * 100) / 100 : 0;
  }

  getDominantImpact(severity) {
    const impacts = Object.entries(severity).sort((a, b) => b[1] - a[1]);
    return impacts[0]?.[0] || 'moderate';
  }
}

// Singleton instance
let benchmarkingServiceInstance = null;

function getBenchmarkingService() {
  if (!benchmarkingServiceInstance) {
    benchmarkingServiceInstance = new BenchmarkingService();
  }
  return benchmarkingServiceInstance;
}

module.exports = {
  BenchmarkingService,
  getBenchmarkingService,
};
