# WCAGAI Production Deployment Guide

**Version**: v4.0-LITE (Production Ready)
**Components**: v3.0 URL Scanner + v4.0-LITE Mock Keyword Scanner
**Dependencies**: Zero external services required
**Cost**: $0/month (Free tier) to $5-20/month (production tier)

---

## 🚀 What You're Deploying

### ✅ Production Ready (Ships Today)
- **v3.0 URL Scanner**: Full accessibility scanning with axe-core
- **v4.0-LITE**: Mock keyword discovery with industry benchmarks
- **10 Industry Verticals**: Finance, healthcare, government, ecommerce, etc.
- **Enterprise Features**: Browser pooling, circuit breakers, metrics, logging
- **Zero Setup**: No Redis, database, or external APIs required

### ❌ Not Included (Upgrade Later)
- Real keyword discovery (needs SerpAPI - $50/month)
- AI remediation (needs Grok/Gemini API - $10/month)
- Redis caching (optional - $10/month)
- PostgreSQL database (optional - free on Railway)

---

## Option A: Deploy to Railway (Recommended)

**Best for**: Production apps, better performance, includes database for future

### Step 1: Prepare Repository

```bash
# Ensure you're on the correct branch
cd /home/user/WCAGAII
git checkout claude/wcagai-v3-production-scanner-011CUv3uwxoLJte35Rs2QQTu

# Verify production readiness
node backend/check-production.js

# Create .gitignore if not exists
cat > .gitignore << 'EOF'
node_modules/
.env
*.log
.DS_Store
screenshots/
EOF

# Commit latest changes
git add .
git commit -m "chore: Production deployment prep for v4.0-LITE"
git push -u origin claude/wcagai-v3-production-scanner-011CUv3uwxoLJte35Rs2QQTu
```

### Step 2: Create Railway Project

1. Go to https://railway.app/
2. Sign in with GitHub
3. Click **"New Project"**
4. Select **"Deploy from GitHub repo"**
5. Choose `WCAGAII` repository
6. Select branch: `claude/wcagai-v3-production-scanner-011CUv3uwxoLJte35Rs2QQTu`

### Step 3: Configure Railway Service

Railway will auto-detect the backend. Configure:

**Root Directory**: `/backend`
**Build Command**: `npm install`
**Start Command**: `npm start`
**Port**: 3000 (auto-detected from server.js)

### Step 4: Environment Variables

In Railway dashboard → Variables tab, add:

```env
NODE_ENV=production
PORT=3000
CORS_ORIGIN=*
LOG_LEVEL=info

# Browser Pool (optional - defaults work)
POOL_SIZE=5
POOL_MAX_USES=50

# Rate Limiting (optional)
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

**Note**: Don't set REDIS_URL, DATABASE_URL, SERP_API_KEY, or GROK_API_KEY. v4.0-LITE doesn't need them.

### Step 5: Deploy

1. Click **"Deploy"**
2. Railway will:
   - Install dependencies (~2 minutes)
   - Download Chromium for Puppeteer (~1 minute)
   - Start server
3. Get your URL: `https://wcagai-production-XXXX.railway.app`

### Step 6: Test Deployment

```bash
# Replace with your Railway URL
export API_URL="https://wcagai-production-XXXX.railway.app"

# Health check
curl "$API_URL/health"

# v3.0 URL scan
curl -X POST "$API_URL/api/scan" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "wcagLevel": "AA"
  }'

# v4.0-LITE keyword scan (mock data)
curl -X POST "$API_URL/api/v4-lite/scan/keywords" \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["fintech", "banking"],
    "vertical": "finance",
    "limit": 5
  }'

# Industry benchmark
curl "$API_URL/api/v4-lite/benchmark/finance"
```

### Railway Pricing

- **Free Trial**: 500 hours/month, 512 MB RAM, 1 GB disk
- **Hobby Plan**: $5/month - 500 hours, 512 MB RAM, 1 GB disk
- **Pro Plan**: $20/month - Unlimited hours, 8 GB RAM, 100 GB disk

**Recommendation**: Start with Hobby ($5/month). Chromium needs ~300 MB RAM.

---

## Option B: Deploy to Vercel

**Best for**: Serverless, auto-scaling, but Puppeteer has limitations

### ⚠️ Puppeteer Limitation on Vercel

Vercel has a **50 MB** deployment size limit. Chromium is ~300 MB. You need `chrome-aws-lambda` workaround.

### Step 1: Install Vercel-Compatible Dependencies

```bash
cd /home/user/WCAGAII/backend

# Install chrome-aws-lambda (smaller Chromium build)
npm install chrome-aws-lambda@10.1.0

# Update package.json
npm install --save-dev vercel
```

### Step 2: Create Vercel Configuration

Create `backend/vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/server.js",
      "use": "@vercel/node",
      "config": {
        "maxLambdaSize": "50mb",
        "includeFiles": ["src/**"]
      }
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "src/server.js"
    }
  ],
  "env": {
    "NODE_ENV": "production",
    "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD": "true",
    "PUPPETEER_EXECUTABLE_PATH": "/opt/nodejs/node_modules/chrome-aws-lambda/bin/chromium"
  }
}
```

### Step 3: Update Scanner to Use chrome-aws-lambda

Create `backend/src/scanner-vercel.js`:

```javascript
const chromium = require('chrome-aws-lambda');
const { AxePuppeteer } = require('@axe-core/puppeteer');

async function scanURL(url, options = {}) {
  let browser;
  try {
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const axeResults = await new AxePuppeteer(page)
      .withTags(['wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();

    return axeResults;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scanURL };
```

### Step 4: Deploy to Vercel

```bash
cd /home/user/WCAGAII/backend

# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - Project name? wcagai
# - Directory? ./
# - Override settings? No

# Production deployment
vercel --prod
```

### Vercel Pricing

- **Free Hobby**: 100 GB bandwidth, 100 hours serverless execution
- **Pro Plan**: $20/month - 1 TB bandwidth, 1000 hours execution

**Warning**: Each scan invokes a serverless function (10-30 seconds). With free tier (100 hours), you get ~360-1080 scans/month.

---

## Option C: Deploy to Render

**Best for**: Similar to Railway, with free tier

### Step 1: Create Render Account

1. Go to https://render.com/
2. Sign in with GitHub

### Step 2: Create Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect GitHub repository `WCAGAII`
3. Configure:
   - **Name**: `wcagai`
   - **Region**: Oregon (US West) or Frankfurt (EU)
   - **Branch**: `claude/wcagai-v3-production-scanner-011CUv3uwxoLJte35Rs2QQTu`
   - **Root Directory**: `backend`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### Step 3: Environment Variables

```env
NODE_ENV=production
PORT=10000
```

### Step 4: Deploy

- Render auto-deploys on git push
- Get URL: `https://wcagai.onrender.com`

### Render Pricing

- **Free Tier**: 750 hours/month, 512 MB RAM, spins down after 15 min inactivity
- **Starter**: $7/month - Always on, 512 MB RAM
- **Standard**: $25/month - 2 GB RAM, better performance

**Warning**: Free tier spins down = 30-60 second cold start on first request.

---

## Option D: Self-Hosted VPS (DigitalOcean/Linode)

**Best for**: Full control, best performance, cheapest at scale

### Step 1: Create Droplet

**DigitalOcean Droplet** (Recommended):
- Size: Basic - $6/month (1 GB RAM, 25 GB SSD)
- Image: Ubuntu 22.04 LTS
- Region: Choose nearest to your users

### Step 2: Initial Server Setup

```bash
# SSH into droplet
ssh root@YOUR_DROPLET_IP

# Update system
apt update && apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Install PM2 (process manager)
npm install -g pm2

# Install nginx (reverse proxy)
apt install -y nginx

# Install dependencies for Puppeteer
apt install -y \
  chromium-browser \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libatspi2.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libwayland-client0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils
```

### Step 3: Deploy Application

```bash
# Create app directory
mkdir -p /var/www/wcagai
cd /var/www/wcagai

# Clone repository
git clone https://github.com/YOUR_USERNAME/WCAGAII.git .
git checkout claude/wcagai-v3-production-scanner-011CUv3uwxoLJte35Rs2QQTu

# Install dependencies
cd backend
npm install --production

# Set environment variables
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
EOF

# Start with PM2
pm2 start src/server.js --name wcagai
pm2 save
pm2 startup
```

### Step 4: Configure Nginx

```bash
# Create nginx config
cat > /etc/nginx/sites-available/wcagai << 'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Increase timeout for long scans
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/wcagai /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### Step 5: Enable HTTPS (Optional but Recommended)

```bash
# Install certbot
apt install -y certbot python3-certbot-nginx

# Get SSL certificate (requires domain name)
certbot --nginx -d your-domain.com
```

### VPS Pricing Comparison

| Provider | Plan | RAM | Storage | Bandwidth | Price |
|----------|------|-----|---------|-----------|-------|
| DigitalOcean | Basic | 1 GB | 25 GB | 1 TB | $6/mo |
| Linode | Nanode | 1 GB | 25 GB | 1 TB | $5/mo |
| Vultr | Regular | 1 GB | 25 GB | 1 TB | $6/mo |
| Hetzner | CX11 | 2 GB | 20 GB | 20 TB | €4.15/mo (~$4.50) |

**Recommendation**: Hetzner (best value) or DigitalOcean (easiest UI)

---

## Performance Benchmarks

### v3.0 URL Scanner
- **Cold start**: 5-8 seconds (first scan after deploy)
- **Warm scans**: 2-4 seconds
- **Concurrent scans**: 5 (browser pool size)
- **Memory usage**: 200-400 MB per active scan

### v4.0-LITE Keyword Scanner
- **Response time**: <100ms (mock data)
- **Memory usage**: <10 MB (no browser needed)
- **Concurrent requests**: 100+ (just JSON responses)

### Recommended Specs by Traffic

| Traffic | Platform | RAM | Cost |
|---------|----------|-----|------|
| <100 scans/day | Railway Free | 512 MB | $0 |
| 100-500 scans/day | Railway Hobby | 512 MB | $5/mo |
| 500-2000 scans/day | Railway Pro or VPS | 1-2 GB | $6-20/mo |
| 2000+ scans/day | VPS or Kubernetes | 4+ GB | $20-50/mo |

---

## Monitoring and Logs

### Railway
- Built-in logs: Click "Logs" tab in dashboard
- Metrics: CPU, RAM, Network usage included
- Alerts: Configure in Settings

### Vercel
- Real-time logs: `vercel logs`
- Function analytics: Vercel dashboard → Analytics
- Error tracking: Automatic error capture

### Self-Hosted (PM2)
```bash
# View logs
pm2 logs wcagai

# Monitor resources
pm2 monit

# Restart if needed
pm2 restart wcagai
```

---

## Upgrade Path: v4.0-LITE → v4.0-FULL

When ready to add real keyword discovery and AI:

### 1. Add Dependencies
```bash
npm install ioredis @prisma/client
```

### 2. Set Up External Services
- **Redis**: Railway Add-On (free) or Upstash ($0.20/month)
- **PostgreSQL**: Railway included (free) or Neon ($0/month)
- **SerpAPI**: Sign up at serpapi.com ($50/month)
- **Grok/Gemini API**: When available ($10-20/month)

### 3. Update Environment Variables
```env
REDIS_URL=redis://...
DATABASE_URL=postgresql://...
SERP_API_KEY=your-key
GROK_API_KEY=your-key
```

### 4. Run Migrations
```bash
npx prisma migrate deploy
npx prisma generate
```

### 5. Enable v4.0-FULL Routes
v4.0-FULL routes will auto-enable when dependencies are available.

**Total Cost for v4.0-FULL**: ~$60-80/month

---

## Troubleshooting

### Issue: Puppeteer "Failed to launch browser"

**Railway/Render**:
```bash
# Add to environment variables
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox
```

**Vercel**: Use `chrome-aws-lambda` (see Option B above)

**Self-hosted**: Install dependencies from Step 2 in Option D

### Issue: High memory usage / crashes

Reduce browser pool size:
```env
POOL_SIZE=3
POOL_MAX_USES=30
```

### Issue: Scans timeout after 30 seconds

Increase timeout in `backend/src/scanner.js`:
```javascript
const scanTimeout = parseInt(process.env.SCAN_TIMEOUT) || 60000; // 60 seconds
```

### Issue: CORS errors from frontend

Set CORS_ORIGIN:
```env
CORS_ORIGIN=https://your-frontend.com
```

Or allow all origins (development only):
```env
CORS_ORIGIN=*
```

---

## Security Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Configure `CORS_ORIGIN` (not `*` in production)
- [ ] Enable rate limiting (already configured in v3.0)
- [ ] Use HTTPS (Vercel/Railway auto-provision, VPS needs certbot)
- [ ] Don't commit `.env` file (already in .gitignore)
- [ ] Review SSRF protection (already enabled in v3.0)
- [ ] Set up error monitoring (Sentry recommended)
- [ ] Configure backup strategy (if using database)

---

## Cost Comparison Summary

| Platform | Free Tier | Paid Tier | Best For |
|----------|-----------|-----------|----------|
| **Railway** | 500 hrs/mo | $5-20/mo | Easy production deploy |
| **Vercel** | 100 hrs/mo | $20/mo | Serverless, auto-scaling |
| **Render** | 750 hrs/mo (sleeps) | $7-25/mo | Similar to Railway |
| **VPS** | None | $5-6/mo | Best performance, control |

**My Recommendation**:

1. **Start with Railway Hobby ($5/mo)**: Easiest deploy, includes future database
2. **Or VPS ($6/mo)**: If you're comfortable with servers, best long-term value
3. **Avoid Vercel**: Puppeteer limitations make it harder

---

## Next Steps

1. **Choose a platform** (I recommend Railway)
2. **Follow deployment steps above**
3. **Test with provided curl commands**
4. **Update frontend to use deployed API URL**
5. **Monitor logs and performance**

Want me to help with any specific deployment platform or create a CI/CD pipeline for automated deployments?
