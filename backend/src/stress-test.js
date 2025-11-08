const { scanURL } = require('./scanner');
const pino = require('pino');

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

class StressTest {
  constructor(options = {}) {
    this.duration = options.duration || 300; // Default 5 minutes
    this.concurrency = options.concurrency || 5;
    this.urls = options.urls || [];
    this.results = {
      totalScans: 0,
      successfulScans: 0,
      failedScans: 0,
      totalTime: 0,
      averageTime: 0,
      minTime: Infinity,
      maxTime: 0,
      errors: [],
      scansPerMinute: 0
    };
    this.startTime = null;
    this.endTime = null;
  }

  async run() {
    logger.info(`Starting stress test for ${this.duration} seconds with concurrency ${this.concurrency}`);
    logger.info(`Testing ${this.urls.length} URLs`);

    this.startTime = Date.now();
    const endTime = this.startTime + (this.duration * 1000);

    const workers = [];
    for (let i = 0; i < this.concurrency; i++) {
      workers.push(this.worker(endTime, i));
    }

    await Promise.all(workers);

    this.endTime = Date.now();
    this.calculateResults();
    this.printReport();

    return this.results;
  }

  async worker(endTime, workerId) {
    let urlIndex = 0;

    while (Date.now() < endTime) {
      const url = this.urls[urlIndex % this.urls.length];
      const scanStart = Date.now();

      try {
        await scanURL(url);
        const scanTime = Date.now() - scanStart;

        this.results.successfulScans++;
        this.results.totalTime += scanTime;
        this.results.minTime = Math.min(this.results.minTime, scanTime);
        this.results.maxTime = Math.max(this.results.maxTime, scanTime);

        logger.debug(`Worker ${workerId}: Scan completed in ${scanTime}ms`);

      } catch (error) {
        this.results.failedScans++;
        this.results.errors.push({
          url,
          error: error.message,
          timestamp: new Date().toISOString()
        });

        logger.error(`Worker ${workerId}: Scan failed for ${url}: ${error.message}`);
      }

      this.results.totalScans++;
      urlIndex++;

      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  calculateResults() {
    const totalTimeInSeconds = (this.endTime - this.startTime) / 1000;
    this.results.averageTime = this.results.successfulScans > 0
      ? this.results.totalTime / this.results.successfulScans
      : 0;
    this.results.scansPerMinute = (this.results.totalScans / totalTimeInSeconds) * 60;
  }

  printReport() {
    logger.info('\n=== STRESS TEST REPORT ===');
    logger.info(`Duration: ${this.duration} seconds`);
    logger.info(`Concurrency: ${this.concurrency}`);
    logger.info(`Total Scans: ${this.results.totalScans}`);
    logger.info(`Successful: ${this.results.successfulScans}`);
    logger.info(`Failed: ${this.results.failedScans}`);
    logger.info(`Success Rate: ${((this.results.successfulScans / this.results.totalScans) * 100).toFixed(2)}%`);
    logger.info(`Average Scan Time: ${this.results.averageTime.toFixed(2)}ms`);
    logger.info(`Min Scan Time: ${this.results.minTime}ms`);
    logger.info(`Max Scan Time: ${this.results.maxTime}ms`);
    logger.info(`Scans Per Minute: ${this.results.scansPerMinute.toFixed(2)}`);

    if (this.results.errors.length > 0) {
      logger.info(`\nErrors (showing first 10):`);
      this.results.errors.slice(0, 10).forEach((err, idx) => {
        logger.error(`${idx + 1}. ${err.url}: ${err.error}`);
      });
    }
  }
}

// CLI runner
if (require.main === module) {
  const args = process.argv.slice(2);
  const duration = args.includes('--duration')
    ? parseInt(args[args.indexOf('--duration') + 1])
    : 300;

  const concurrency = args.includes('--concurrency')
    ? parseInt(args[args.indexOf('--concurrency') + 1])
    : 5;

  // Default test URLs
  const testUrls = [
    'https://www.google.com',
    'https://www.github.com',
    'https://www.wikipedia.org',
    'https://www.npmjs.com',
    'https://developer.mozilla.org'
  ];

  const test = new StressTest({
    duration,
    concurrency,
    urls: testUrls
  });

  test.run()
    .then(() => {
      logger.info('Stress test completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Stress test failed:', error);
      process.exit(1);
    });
}

module.exports = StressTest;
