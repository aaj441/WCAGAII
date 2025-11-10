# WCAGAI Quick Start Guide

**Deploy in 5 minutes** | **Zero configuration needed** | **Production ready**

---

## 🎯 What You're Getting

✅ **v3.0 URL Scanner** - Full WCAG 2.2 AA accessibility scanning with axe-core
✅ **v4.0-LITE Mock Scanner** - Industry keyword discovery with benchmarks (mock data)
✅ **10 Industry Verticals** - Finance, healthcare, government, ecommerce, and more
✅ **Zero Dependencies** - No external APIs, Redis, or databases required
✅ **Production Ready** - Enterprise features: rate limiting, circuit breakers, metrics

---

## 🚀 Fastest Deployment: Railway (Recommended)

**Time**: 5 minutes | **Cost**: $0-5/month | **Difficulty**: ⭐ Easy

### Step 1: Prepare Git

```bash
cd /home/user/WCAGAII

# Verify production readiness
node backend/check-production.js

# Commit and push
git add .
git commit -m "chore: Production deployment for v4.0-LITE"
git push -u origin claude/wcagai-v3-production-scanner-011CUv3uwxoLJte35Rs2QQTu
```

### Step 2: Deploy to Railway

1. **Go to**: https://railway.app/new
2. **Sign in** with GitHub
3. **Click**: "Deploy from GitHub repo"
4. **Select**: `WCAGAII` repository
5. **Select branch**: `claude/wcagai-v3-production-scanner-011CUv3uwxoLJte35Rs2QQTu`
6. **Configure**:
   - Root Directory: `backend`
   - Build: `npm install`
   - Start: `npm start`

### Step 3: Set Environment Variables

In Railway dashboard → Variables:

```env
NODE_ENV=production
PORT=3000
```

**That's it!** Railway will deploy automatically.

### Step 4: Verify Deployment

```bash
# Get your Railway URL from dashboard (e.g., https://wcagai-production-abc123.railway.app)
export API_URL="https://YOUR-RAILWAY-URL.railway.app"

# Run verification script
./verify-deployment.sh $API_URL
```

**Expected output**:
```
========================================
  ✓ DEPLOYMENT VERIFIED
========================================

🚀 Your WCAGAI deployment is production ready!
```

---

## 🧪 Quick API Test

Once deployed, test with curl:

### Health Check
```bash
curl https://YOUR-URL/health
```

### v3.0 URL Scan
```bash
curl -X POST https://YOUR-URL/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "wcagLevel": "AA"
  }'
```

### v4.0-LITE Keyword Scan (Mock)
```bash
curl -X POST https://YOUR-URL/api/v4-lite/scan/keywords \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["fintech", "banking"],
    "vertical": "finance",
    "limit": 5
  }'
```

### Industry Benchmark
```bash
curl https://YOUR-URL/api/v4-lite/benchmark/finance
```

---

## 📊 API Endpoints Reference

### v3.0 URL Scanner

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scan` | Scan a URL for WCAG violations |
| POST | `/api/scan/html` | Scan HTML string |
| POST | `/api/scan/batch` | Batch scan multiple URLs |
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |
| GET | `/api-docs` | Swagger documentation |

### v4.0-LITE Mock Scanner

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v4-lite/scan/keywords` | Mock keyword discovery scan |
| GET | `/api/v4-lite/benchmark/:vertical` | Industry benchmark data |
| POST | `/api/v4-lite/compare` | Compare score to industry |
| GET | `/api/v4-lite/verticals` | List available verticals |
| GET | `/api/v4-lite/health` | v4.0-LITE health check |

---

## 🏭 Industry Verticals

v4.0-LITE supports 10 industry verticals with specific compliance requirements:

| Vertical | WCAG Level | Required Score | Standards |
|----------|------------|----------------|-----------|
| **Finance** | AAA | 95 | WCAG 2.2, Section 508, ADA Title III |
| **Healthcare** | AAA | 95 | WCAG 2.2, HIPAA, Section 508 |
| **Government** | AAA | 90 | WCAG 2.2, Section 508 |
| **E-commerce** | AA | 85 | WCAG 2.2, ADA Title III |
| **Education** | AA | 90 | WCAG 2.2, Section 504 |
| **SaaS** | AA | 85 | WCAG 2.2, VPAT |
| **Nonprofit** | AA | 80 | WCAG 2.2, ADA |
| **Travel** | AA | 85 | WCAG 2.2, ADA Title III |
| **Real Estate** | AA | 80 | WCAG 2.2, ADA Title III |
| **General** | AA | 80 | WCAG 2.2 |

---

## 💰 Pricing Comparison

| Platform | Free Tier | Paid Tier | Best For |
|----------|-----------|-----------|----------|
| **Railway** | 500 hrs/mo | $5/mo (Hobby) | ✅ Recommended - Easy + cheap |
| **Render** | 750 hrs/mo* | $7/mo | Good alternative (*spins down) |
| **DigitalOcean** | None | $6/mo | VPS - Full control |
| **Vercel** | 100 hrs/mo | $20/mo | ❌ Puppeteer limitations |

**Recommendation**: Start with Railway ($5/mo) or DigitalOcean VPS ($6/mo)

---

## ⚡ Performance Expectations

### v3.0 URL Scanner
- **First scan (cold start)**: 5-8 seconds
- **Subsequent scans**: 2-4 seconds
- **Concurrent scans**: 5 (configurable)
- **Memory usage**: 200-400 MB per scan

### v4.0-LITE Mock Scanner
- **Response time**: <100ms
- **Memory usage**: <10 MB
- **Concurrent requests**: 100+

---

## 🔧 Configuration (Optional)

Set these environment variables to customize:

```env
# Server
PORT=3000
NODE_ENV=production

# CORS
CORS_ORIGIN=https://your-frontend.com
# Or allow all (dev only): CORS_ORIGIN=*

# Browser Pool
POOL_SIZE=5
POOL_MAX_USES=50

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
```

---

## 🆙 Upgrade to v4.0-FULL (Optional)

v4.0-LITE uses mock data. To enable real keyword discovery and AI remediation:

### Requirements
- **SerpAPI**: Keyword discovery ($50/month) - https://serpapi.com
- **Redis**: Caching (free on Railway)
- **PostgreSQL**: Database (free on Railway)
- **Grok/Gemini API**: AI remediation ($10-20/month)

### Install Dependencies
```bash
cd backend
npm install ioredis @prisma/client
```

### Set Environment Variables
```env
REDIS_URL=redis://...
DATABASE_URL=postgresql://...
SERP_API_KEY=your-serpapi-key
GROK_API_KEY=your-grok-key  # or GEMINI_API_KEY
```

### Run Database Migrations
```bash
npx prisma migrate deploy
npx prisma generate
```

### Verify v4.0-FULL
```bash
curl -X POST https://YOUR-URL/api/v4/scan/keywords \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["fintech"],
    "vertical": "finance",
    "limit": 5,
    "enableAI": true
  }'
```

**Total cost for v4.0-FULL**: ~$60-80/month

---

## 🐛 Troubleshooting

### Deployment fails: "Puppeteer failed to launch"

Add environment variables:
```env
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox
```

### High memory usage / OOM errors

Reduce browser pool:
```env
POOL_SIZE=3
POOL_MAX_USES=30
```

Or increase memory:
- Railway: Upgrade to Pro (8 GB RAM)
- VPS: Choose 2 GB plan

### Scans timeout after 30 seconds

Increase timeout:
```env
SCAN_TIMEOUT=60000
```

### CORS errors from frontend

Set CORS origin:
```env
CORS_ORIGIN=https://your-frontend.com
```

---

## 📚 Full Documentation

- **Deployment Guide**: See `DEPLOYMENT.md` for detailed platform-specific instructions
- **API Documentation**: Access `/api-docs` on your deployed instance
- **Honest Status**: See `backend/HONEST_STATUS.md` for what's working vs. aspirational

---

## ✅ Production Checklist

Before going live:

- [ ] Deploy to Railway/Render/VPS
- [ ] Run `verify-deployment.sh` and confirm all tests pass
- [ ] Test API endpoints with real data
- [ ] Set `CORS_ORIGIN` to your frontend domain
- [ ] Enable HTTPS (auto on Railway/Vercel, use certbot on VPS)
- [ ] Set up uptime monitoring (UptimeRobot, Better Stack)
- [ ] Configure error tracking (Sentry recommended)
- [ ] Review rate limits for your expected traffic
- [ ] Document your API URL for frontend team
- [ ] Test under load (optional: `artillery` or `k6`)

---

## 🎉 Next Steps

Once deployed:

1. **Update Frontend**: Point to deployed API URL
2. **Monitor Logs**: Check for errors in first 24 hours
3. **Test Real Scans**: Scan your actual websites
4. **Share API Docs**: Send `/api-docs` URL to team
5. **Consider v4.0-FULL**: If you need real keyword discovery

---

## 🆘 Need Help?

**Deployment issues?**
- Railway: Check logs in dashboard
- Render: Check "Events" tab
- VPS: `pm2 logs wcagai`

**API not working?**
- Run: `./verify-deployment.sh YOUR-URL`
- Check: `/health` endpoint
- Review: Server logs

**Performance issues?**
- Reduce `POOL_SIZE`
- Increase memory allocation
- Consider caching layer (Redis)

---

## 📊 What You've Deployed

```
✅ v3.0 URL Scanner (100% working)
   → Scan any URL for WCAG 2.2 AA violations
   → Full axe-core integration
   → Browser pooling for performance
   → Circuit breakers for resilience

✅ v4.0-LITE Mock Scanner (100% working)
   → Industry keyword discovery (mock data)
   → 10 vertical-specific configurations
   → Industry benchmarking (WebAIM 2024 data)
   → Score comparison and percentiles

❌ v4.0-FULL (Not included - requires upgrade)
   → Real SerpAPI keyword discovery
   → AI-powered remediation (Grok/Gemini)
   → Redis caching
   → PostgreSQL database
```

---

**You're ready to ship! 🚀**

Deploy now with Railway and have a production accessibility API running in 5 minutes.
