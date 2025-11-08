# Axe-Core Integration in WCAGAI v3.0

## Overview

WCAGAI v3.0 uses [axe-core](https://github.com/dequelabs/axe-core) as its core accessibility testing engine. Axe-core is an industry-leading accessibility testing library developed by Deque Systems that implements the WCAG 2.2 standards.

**Version**: 4.10.2
**License**: MPL-2.0
**Integration Points**: URL scanning (Puppeteer) and HTML scanning (JSDOM)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WCAGAI v3.0 Backend                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐         ┌──────────────┐                │
│  │ URL Scanning │         │ HTML Scanning│                │
│  │  (Puppeteer) │         │   (JSDOM)    │                │
│  └──────┬───────┘         └──────┬───────┘                │
│         │                        │                         │
│         └────────────┬───────────┘                         │
│                      ▼                                      │
│            ┌─────────────────┐                             │
│            │   @axe-core/    │                             │
│            │   puppeteer     │                             │
│            └────────┬────────┘                             │
│                     │                                       │
│                     ▼                                       │
│            ┌─────────────────┐                             │
│            │    axe-core     │                             │
│            │   4.10.2        │                             │
│            └────────┬────────┘                             │
│                     │                                       │
│                     ▼                                       │
│            ┌─────────────────┐                             │
│            │  Accessibility  │                             │
│            │    Results      │                             │
│            └────────┬────────┘                             │
│                     │                                       │
│                     ▼                                       │
│            ┌─────────────────┐                             │
│            │  AI Enhancement │                             │
│            │ (Google Gemini) │                             │
│            └─────────────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Integration Methods

### Method 1: URL Scanning with Puppeteer

**Library**: `@axe-core/puppeteer`

```javascript
const { AxeBuilder } = require('@axe-core/puppeteer');
const puppeteer = require('puppeteer');

async function scanURL(url, options = {}) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: options.viewport?.width || 1920,
    height: options.viewport?.height || 1080
  });

  await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout: options.timeout || 30000
  });

  // Run axe-core analysis
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  await browser.close();
  return results;
}
```

**Key Features**:
- Automated browser control via Puppeteer
- Real DOM analysis (JavaScript execution included)
- Configurable viewport for responsive testing
- Network idle detection for dynamic content
- Full WCAG 2.0, 2.1, 2.2 Level A & AA coverage

---

### Method 2: HTML Scanning with JSDOM

**Library**: `axe-core` + `jsdom`

```javascript
const { JSDOM } = require('jsdom');
const { axe } = require('axe-core');

async function scanHTML(htmlContent, options = {}) {
  const dom = new JSDOM(htmlContent, {
    url: options.baseURL || 'http://localhost',
    runScripts: 'outside-only',
    resources: 'usable'
  });

  const { window } = dom;
  const { document } = window;

  // Inject axe-core into JSDOM
  const axeSource = require('axe-core').source;
  const script = document.createElement('script');
  script.textContent = axeSource;
  document.head.appendChild(script);

  // Run axe analysis
  const results = await window.axe.run(document, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
    }
  });

  return results;
}
```

**Key Features**:
- Server-side HTML analysis
- No browser overhead (faster for static content)
- Ideal for HTML snippets and templates
- Security-isolated environment

---

## Axe Results Structure

```javascript
{
  "url": "https://example.com",
  "timestamp": "2024-11-08T12:00:00.000Z",
  "violations": [
    {
      "id": "color-contrast",
      "impact": "serious",
      "tags": ["wcag2aa", "wcag143"],
      "description": "Elements must have sufficient color contrast",
      "help": "Ensures the contrast between foreground and background colors meets WCAG 2 AA contrast ratio thresholds",
      "helpUrl": "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
      "nodes": [
        {
          "html": "<a href=\"#\">Low contrast link</a>",
          "target": ["a[href='#']"],
          "failureSummary": "Fix any of the following:\n  Element has insufficient color contrast of 3.14:1",
          "impact": "serious",
          "any": [
            {
              "id": "color-contrast",
              "data": {
                "fgColor": "#777777",
                "bgColor": "#ffffff",
                "contrastRatio": "3.14",
                "expectedContrastRatio": "4.5:1"
              }
            }
          ]
        }
      ]
    }
  ],
  "passes": [...],
  "incomplete": [...],
  "inapplicable": [...]
}
```

---

## WCAG Tag Mapping

Axe-core organizes rules by WCAG tags:

| Tag | WCAG Level | Success Criteria |
|-----|------------|------------------|
| `wcag2a` | Level A | WCAG 2.0 Level A |
| `wcag2aa` | Level AA | WCAG 2.0 Level AA |
| `wcag21a` | Level A | WCAG 2.1 Level A (new) |
| `wcag21aa` | Level AA | WCAG 2.1 Level AA (new) |
| `wcag22aa` | Level AA | WCAG 2.2 Level AA (new) |

**Example WCAG 2.2 Rules**:
- `target-size` - 2.5.8 Target Size (Minimum)
- `focus-visible` - 2.4.11 Focus Not Obscured (Minimum)
- `draggable-elements` - 2.5.7 Dragging Movements

---

## AI Enhancement with Google Gemini

WCAGAI enhances axe-core results with Google's Gemini AI for actionable recommendations:

```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function enhanceWithAI(axeResults) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `
    Analyze these accessibility violations and provide:
    1. Severity prioritization
    2. Step-by-step fixes
    3. Code examples
    4. Business impact

    Violations: ${JSON.stringify(axeResults.violations, null, 2)}
  `;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
```

**AI Enhancements**:
- **Prioritization**: Ranks issues by user impact
- **Code Examples**: Provides before/after HTML fixes
- **Context**: Explains why each issue matters
- **Remediation Time**: Estimates effort required

---

## Production Configuration

### Browser Pool Integration

```javascript
const browserPool = require('./services/browserPool');

async function scanURLWithPool(url, options = {}) {
  const browser = await browserPool.acquire();

  try {
    const page = await browser.newPage();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    await browserPool.release(browser);
    return results;
  } catch (error) {
    await browserPool.release(browser);
    throw error;
  }
}
```

**Performance Benefits**:
- **20x faster** scans (100ms vs 2000ms browser launch)
- Reuses warm browser instances
- Auto-healing on crashes

---

### Metrics and Monitoring

```javascript
const { scanDuration, violationCounter } = require('./services/metrics');

async function scanWithMetrics(url) {
  const end = scanDuration.startTimer({ type: 'url' });

  try {
    const results = await scanURL(url);

    // Record violations by impact
    results.violations.forEach(violation => {
      violationCounter.inc({
        rule: violation.id,
        impact: violation.impact
      });
    });

    end({ status: 'success' });
    return results;
  } catch (error) {
    end({ status: 'error' });
    throw error;
  }
}
```

**Prometheus Metrics**:
- `wcagai_scan_duration_seconds` - Scan performance
- `wcagai_violations_total` - Violation counts by rule and impact
- `wcagai_scan_total` - Success/failure rates

---

## API Integration

### Scan Endpoint

```javascript
/**
 * @swagger
 * /api/scan:
 *   post:
 *     summary: Scan URL or HTML for accessibility issues
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [url, html]
 *               input:
 *                 type: string
 *               options:
 *                 type: object
 *                 properties:
 *                   timeout:
 *                     type: number
 *                   viewport:
 *                     type: object
 *     responses:
 *       200:
 *         description: Accessibility scan results
 */
app.post('/api/scan', async (req, res) => {
  const { type, input, options } = req.body;

  let results;
  if (type === 'url') {
    results = await scanURL(input, options);
  } else {
    results = await scanHTML(input, options);
  }

  const enhanced = await enhanceWithAI(results);

  res.json({
    axeResults: results,
    aiRecommendations: enhanced,
    metadata: {
      engine: 'axe-core',
      version: '4.10.2',
      wcagLevel: 'AA',
      timestamp: new Date().toISOString()
    }
  });
});
```

---

## Testing

### Unit Test Example

```javascript
const { scanHTML } = require('../scanner');

describe('Axe-core Integration', () => {
  test('detects missing alt text', async () => {
    const html = '<img src="test.jpg">';
    const results = await scanHTML(html);

    expect(results.violations).toContainEqual(
      expect.objectContaining({
        id: 'image-alt',
        impact: 'critical'
      })
    );
  });

  test('passes valid semantic HTML', async () => {
    const html = `
      <main>
        <h1>Page Title</h1>
        <img src="test.jpg" alt="Description">
      </main>
    `;
    const results = await scanHTML(html);

    expect(results.violations).toHaveLength(0);
  });
});
```

---

## Limitations and Considerations

### What Axe-Core Cannot Detect

1. **Semantic Meaning**: Cannot verify if alt text is meaningful
2. **Reading Level**: Cannot assess content complexity (WCAG 3.1.5)
3. **User Testing**: Cannot replace manual keyboard/screen reader testing
4. **Dynamic Interactions**: May miss AJAX-loaded content

### Best Practices

```javascript
// ✅ Good: Wait for dynamic content
await page.goto(url, { waitUntil: 'networkidle2' });
await page.waitForSelector('.dynamic-content');

// ✅ Good: Test multiple viewports
for (const viewport of [{ width: 320 }, { width: 1920 }]) {
  await page.setViewport(viewport);
  const results = await new AxeBuilder({ page }).analyze();
}

// ✅ Good: Use appropriate tags
.withTags(['wcag2aa', 'wcag22aa']) // Only AA rules

// ❌ Bad: Running all rules (includes experimental)
.analyze() // Too many false positives
```

---

## Dependencies

```json
{
  "dependencies": {
    "axe-core": "^4.10.2",
    "@axe-core/puppeteer": "^4.10.0",
    "puppeteer": "^21.11.0",
    "jsdom": "^23.0.0",
    "@google/generative-ai": "^0.21.0"
  }
}
```

---

## Resources

- **Axe-core Documentation**: https://github.com/dequelabs/axe-core
- **Rule Descriptions**: https://dequeuniversity.com/rules/axe/4.10
- **WCAG 2.2**: https://www.w3.org/WAI/WCAG22/quickref/
- **Puppeteer Integration**: https://github.com/dequelabs/axe-core-npm/tree/develop/packages/puppeteer

---

## Version History

| Version | Axe-Core | Release Date | Key Features |
|---------|----------|--------------|--------------|
| v3.0.0 | 4.10.2 | 2024-11-08 | WCAG 2.2 support, AI enhancement |
| v2.0.0 | 4.8.0 | 2024-06-15 | Puppeteer integration |
| v1.0.0 | 4.6.0 | 2024-01-10 | Initial release |

---

**Last Updated**: November 8, 2024
**Maintained By**: WCAGAI Team
**Support**: accessibility@wcagai.com
