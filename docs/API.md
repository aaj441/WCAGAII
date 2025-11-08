# WCAGAI v3.0 API Documentation

## Base URL

```
Development: http://localhost:8000
Production: https://your-backend.railway.app
```

## Authentication

Currently, no authentication is required. In production, consider implementing:
- API keys
- JWT tokens
- Rate limiting per IP/user

## Endpoints

### 1. Health Check

Check the health status of the backend service.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "memory": {
    "rss": 123456789,
    "heapTotal": 98765432,
    "heapUsed": 87654321,
    "external": 1234567,
    "arrayBuffers": 123456
  },
  "puppeteerReady": true
}
```

**Status Codes:**
- `200` - Service is healthy
- `503` - Service is unhealthy

---

### 2. Readiness Check

Check if the service is ready to accept requests (for load balancers).

**Endpoint:** `GET /health/ready`

**Response:**
```json
{
  "ready": true
}
```

**Status Codes:**
- `200` - Service is ready
- `503` - Service is not ready

---

### 3. Liveness Check

Check if the service is alive (for orchestration platforms).

**Endpoint:** `GET /health/live`

**Response:**
```json
{
  "alive": true,
  "uptime": 3600.5,
  "memory": {
    "rss": 123456789,
    "heapTotal": 98765432,
    "heapUsed": 87654321
  }
}
```

**Status Codes:**
- `200` - Service is alive

---

### 4. Single Scan

Scan a URL or HTML content for WCAG 2.2 AA compliance.

**Endpoint:** `POST /api/scan`

**Request Body:**

**Option 1: URL Scan**
```json
{
  "type": "url",
  "input": "https://example.com",
  "options": {}
}
```

**Option 2: HTML Scan**
```json
{
  "type": "html",
  "input": "<html><body><h1>Hello World</h1></body></html>",
  "options": {}
}
```

**Parameters:**
- `type` (required): Either "url" or "html"
- `input` (required): The URL or HTML content to scan
- `options` (optional): Additional scanning options (reserved for future use)

**Response:**
```json
{
  "scanId": "scan_1705315200000_abc123def",
  "url": "https://example.com",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "scanTime": 3456,
  "summary": {
    "violations": 12,
    "passes": 45,
    "incomplete": 3,
    "complianceScore": 78.95,
    "violationsBySeverity": {
      "critical": 2,
      "serious": 4,
      "moderate": 3,
      "minor": 3
    }
  },
  "violations": [
    {
      "id": "color-contrast",
      "impact": "serious",
      "description": "Ensures the contrast between foreground and background colors meets WCAG 2 AA contrast ratio thresholds",
      "help": "Elements must have sufficient color contrast",
      "helpUrl": "https://dequeuniversity.com/rules/axe/4.8/color-contrast",
      "tags": ["wcag2aa", "wcag143"],
      "nodes": [
        {
          "html": "<button class=\"btn\">Click Me</button>",
          "target": [".btn"],
          "failureSummary": "Fix any of the following:\n  Element has insufficient color contrast of 3.2:1 (foreground color: #777777, background color: #ffffff, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1",
          "impact": "serious"
        }
      ]
    }
  ],
  "passes": [
    {
      "id": "aria-allowed-attr",
      "description": "Ensures ARIA attributes are allowed for an element's role",
      "help": "Elements must only use allowed ARIA attributes",
      "tags": ["wcag2a", "wcag412"],
      "nodes": 15
    }
  ],
  "incomplete": [
    {
      "id": "color-contrast",
      "impact": "serious",
      "description": "Ensures the contrast between foreground and background colors meets WCAG 2 AA contrast ratio thresholds",
      "help": "Elements must have sufficient color contrast",
      "helpUrl": "https://dequeuniversity.com/rules/axe/4.8/color-contrast",
      "tags": ["wcag2aa", "wcag143"],
      "nodes": 2
    }
  ],
  "testEngine": {
    "name": "axe-core",
    "version": "4.8.2"
  },
  "testRunner": {
    "name": "axe"
  },
  "testEnvironment": {
    "userAgent": "Mozilla/5.0...",
    "windowWidth": 1920,
    "windowHeight": 1080,
    "orientationType": "landscape-primary"
  }
}
```

**Status Codes:**
- `200` - Scan completed successfully
- `400` - Invalid request (missing type or input)
- `500` - Scan failed (network error, timeout, etc.)

**Error Response:**
```json
{
  "scanId": "scan_1705315200000_abc123def",
  "error": "Scan failed after 3 retries: Navigation timeout of 30000 ms exceeded",
  "stack": "Error: Navigation timeout..."  // Only in development
}
```

---

### 5. Bulk Scan

Initiate a bulk scan of multiple URLs (asynchronous).

**Endpoint:** `POST /api/scan/bulk`

**Request Body:**
```json
{
  "urls": [
    "https://example1.com",
    "https://example2.com",
    "https://example3.com"
  ],
  "options": {}
}
```

**Parameters:**
- `urls` (required): Array of URLs to scan (max 100)
- `options` (optional): Additional scanning options

**Response:**
```json
{
  "batchId": "batch_1705315200000",
  "status": "processing",
  "totalUrls": 3,
  "message": "Bulk scan initiated. Check /api/scan/bulk/:batchId for status"
}
```

**Status Codes:**
- `200` - Bulk scan initiated
- `400` - Invalid request (empty array, too many URLs)

---

### 6. Bulk Scan Status

Check the status of a bulk scan.

**Endpoint:** `GET /api/scan/bulk/:batchId`

**Response (Processing):**
```json
{
  "status": "processing",
  "progress": 15,
  "total": 50,
  "results": [],
  "errors": []
}
```

**Response (Completed):**
```json
{
  "status": "completed",
  "progress": 50,
  "total": 50,
  "results": [
    {
      "url": "https://example1.com",
      "timestamp": "2024-01-15T10:00:00.000Z",
      "scanTime": 3456,
      "summary": {
        "violations": 12,
        "passes": 45,
        "complianceScore": 78.95
      }
    }
  ],
  "errors": [
    {
      "url": "https://failed-site.com",
      "error": "Navigation timeout"
    }
  ],
  "totalTime": 125000,
  "averageTimePerScan": 2500
}
```

**Status Codes:**
- `200` - Batch status retrieved
- `404` - Batch not found

---

## Rate Limiting

**Current:** No rate limiting implemented

**Recommended for Production:**
```
- 100 requests per 15 minutes per IP
- 10 bulk scans per hour per IP
- 1000 total scans per day per API key
```

Configure via environment variables:
```env
RATE_LIMIT_WINDOW=900000  # 15 minutes
RATE_LIMIT_MAX=100
```

---

## Error Codes

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Invalid type | Type must be "url" or "html" |
| 400 | Missing fields | type and input are required |
| 400 | Too many URLs | Maximum 100 URLs per bulk scan |
| 403 | Forbidden | Attempting to scan private/internal IPs |
| 404 | Not found | Batch ID does not exist |
| 500 | Scan failed | Network error, timeout, or internal error |
| 503 | Service unhealthy | Backend is not ready to accept requests |

---

## Security Considerations

### SSRF Protection

The scanner blocks requests to private IP ranges:
- `localhost` / `127.0.0.0/8`
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`
- `file://` protocol

**Blocked Example:**
```json
{
  "type": "url",
  "input": "http://localhost:8080"
}
```

**Response:**
```json
{
  "error": "Scanning private/internal URLs is not allowed for security reasons"
}
```

### Input Validation

- URLs must be valid HTTP/HTTPS
- HTML input is sanitized before rendering
- Maximum request size: 10MB

### CORS

Configure allowed origins via environment variable:
```env
CORS_ORIGIN=https://your-frontend.netlify.app
```

---

## Code Examples

### JavaScript (Fetch)

```javascript
async function scanWebsite(url) {
  const response = await fetch('http://localhost:8000/api/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'url',
      input: url
    })
  });

  const results = await response.json();
  console.log(`Found ${results.summary.violations} violations`);
  return results;
}

scanWebsite('https://example.com');
```

### Python (requests)

```python
import requests

def scan_website(url):
    response = requests.post(
        'http://localhost:8000/api/scan',
        json={
            'type': 'url',
            'input': url
        }
    )

    results = response.json()
    print(f"Found {results['summary']['violations']} violations")
    return results

scan_website('https://example.com')
```

### cURL

```bash
curl -X POST http://localhost:8000/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "type": "url",
    "input": "https://example.com"
  }'
```

---

## Webhooks (Future Feature)

Coming soon: Register webhooks to receive scan completion notifications.

```json
{
  "type": "url",
  "input": "https://example.com",
  "options": {
    "webhook": "https://your-app.com/webhook/scan-complete"
  }
}
```

---

## Support

For issues or questions:
- GitHub Issues: [link]
- Documentation: `/docs`
- API Status: `GET /health`

**Version:** 3.0.0
**Last Updated:** January 2024
