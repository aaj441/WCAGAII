const puppeteer = require('puppeteer');
const { AxePuppeteer } = require('@axe-core/puppeteer');
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

let browser = null;
const MAX_RETRIES = 3;
const SCAN_TIMEOUT = parseInt(process.env.SCAN_TIMEOUT) || 30000;

// Initialize browser pool
async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    logger.info('Launching new browser instance');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ],
      timeout: 30000
    });
  }
  return browser;
}

// SSRF Protection: Block private IPs
function isPrivateIP(url) {
  const privateRanges = [
    /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+)/,
    /^https?:\/\/10\.\d+\.\d+\.\d+/,
    /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/,
    /^https?:\/\/192\.168\.\d+\.\d+/,
    /^file:\/\//
  ];

  return privateRanges.some(regex => regex.test(url));
}

async function scanURL(url, options = {}) {
  const startTime = Date.now();

  // Security validation
  if (isPrivateIP(url)) {
    throw new Error('Scanning private/internal URLs is not allowed for security reasons');
  }

  let page = null;
  let retries = 0;

  while (retries < MAX_RETRIES) {
    try {
      const browserInstance = await getBrowser();
      page = await browserInstance.newPage();

      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Navigate with timeout
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: SCAN_TIMEOUT
      });

      // Wait for dynamic content
      await page.waitForTimeout(2000);

      // Run axe-core scan
      const axeResults = await new AxePuppeteer(page)
        .options({
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
          }
        })
        .analyze();

      await page.close();

      // Format results
      return formatScanResults(url, axeResults, Date.now() - startTime);

    } catch (error) {
      retries++;
      logger.warn({ url, retries, error: error.message }, 'Scan attempt failed');

      if (page) {
        try {
          await page.close();
        } catch (closeError) {
          logger.error('Error closing page:', closeError);
        }
      }

      if (retries >= MAX_RETRIES) {
        throw new Error(`Scan failed after ${MAX_RETRIES} retries: ${error.message}`);
      }

      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * retries));
    }
  }
}

async function scanHTML(html, options = {}) {
  const startTime = Date.now();
  let page = null;

  try {
    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();

    await page.setViewport({ width: 1920, height: 1080 });

    // Set HTML content
    await page.setContent(html, {
      waitUntil: 'networkidle2',
      timeout: SCAN_TIMEOUT
    });

    // Wait for dynamic content
    await page.waitForTimeout(1000);

    // Run axe-core scan
    const axeResults = await new AxePuppeteer(page)
      .options({
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
        }
      })
      .analyze();

    await page.close();

    // Format results
    return formatScanResults('[HTML Content]', axeResults, Date.now() - startTime);

  } catch (error) {
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        logger.error('Error closing page:', closeError);
      }
    }
    throw error;
  }
}

function formatScanResults(url, axeResults, scanTime) {
  const violations = axeResults.violations.map(violation => ({
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    help: violation.help,
    helpUrl: violation.helpUrl,
    tags: violation.tags,
    nodes: violation.nodes.map(node => ({
      html: node.html,
      target: node.target,
      failureSummary: node.failureSummary,
      impact: node.impact
    }))
  }));

  const passes = axeResults.passes.map(pass => ({
    id: pass.id,
    description: pass.description,
    help: pass.help,
    tags: pass.tags,
    nodes: pass.nodes.length
  }));

  const incomplete = axeResults.incomplete.map(item => ({
    id: item.id,
    impact: item.impact,
    description: item.description,
    help: item.help,
    helpUrl: item.helpUrl,
    tags: item.tags,
    nodes: item.nodes.length
  }));

  // Calculate compliance score
  const totalChecks = violations.length + passes.length;
  const complianceScore = totalChecks > 0
    ? ((passes.length / totalChecks) * 100).toFixed(2)
    : 100;

  // Categorize violations by severity
  const violationsBySeverity = {
    critical: violations.filter(v => v.impact === 'critical').length,
    serious: violations.filter(v => v.impact === 'serious').length,
    moderate: violations.filter(v => v.impact === 'moderate').length,
    minor: violations.filter(v => v.impact === 'minor').length
  };

  return {
    url,
    timestamp: new Date().toISOString(),
    scanTime,
    summary: {
      violations: violations.length,
      passes: passes.length,
      incomplete: incomplete.length,
      complianceScore: parseFloat(complianceScore),
      violationsBySeverity
    },
    violations,
    passes,
    incomplete,
    testEngine: {
      name: axeResults.testEngine.name,
      version: axeResults.testEngine.version
    },
    testRunner: {
      name: axeResults.testRunner.name
    },
    testEnvironment: {
      userAgent: axeResults.testEnvironment.userAgent,
      windowWidth: axeResults.testEnvironment.windowWidth,
      windowHeight: axeResults.testEnvironment.windowHeight,
      orientationType: axeResults.testEnvironment.orientationType
    }
  };
}

async function getHealthStatus() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    puppeteerReady: false
  };

  try {
    const browserInstance = await getBrowser();
    health.puppeteerReady = browserInstance.isConnected();
  } catch (error) {
    health.status = 'unhealthy';
    health.puppeteerReady = false;
    health.error = error.message;
  }

  return health;
}

// Cleanup on process exit
process.on('exit', async () => {
  if (browser) {
    await browser.close();
  }
});

module.exports = {
  scanURL,
  scanHTML,
  getHealthStatus,
  getBrowser
};
