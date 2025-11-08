# WCAGAI v3.0 - Deployment Guide

Complete deployment guide for all enterprise features.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Docker Compose Deployment](#docker-compose-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [Cloud Platform Deployment](#cloud-platform-deployment)
6. [Post-Deployment Configuration](#post-deployment-configuration)
7. [Monitoring & Observability](#monitoring--observability)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js**: 18.0.0+
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Kubernetes** (optional): 1.25+
- **kubectl** (optional): 1.25+
- **Go** (for scanner-go): 1.21+

### Required Services

- **PostgreSQL**: 14+ (for database features)
- **Redis**: 7+ (for caching features)
- **CloudFlare or CloudFront** (optional, for CDN)

---

## Environment Variables

### Backend (.env)

```bash
# Server
NODE_ENV=production
PORT=8000

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/wcagai?schema=public"
DATABASE_REPLICA_URLS="postgresql://user:password@replica1:5432/wcagai,postgresql://user:password@replica2:5432/wcagai"

# Redis
REDIS_URL="redis://localhost:6379"
REDIS_CLUSTER_ENABLED=false
REDIS_CLUSTER_NODES="redis-0:6379,redis-1:6379,redis-2:6379"
REDIS_PASSWORD=""
REDIS_TLS=false

# CDN
CDN_ENABLED=true
CDN_PROVIDER=cloudflare  # or cloudfront
CLOUDFLARE_ZONE_ID=your_zone_id
CLOUDFLARE_API_TOKEN=your_api_token
CLOUDFRONT_DISTRIBUTION_ID=your_dist_id

# AWS (for CloudFront)
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1

# CORS
CORS_ORIGIN=https://wcagai.com,https://www.wcagai.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# HTTP/3
HTTP3_ENABLED=true
HTTP3_PORT=443
HTTP3_CERT_PATH=/etc/ssl/certs/server.crt
HTTP3_KEY_PATH=/etc/ssl/private/server.key

# Gemini AI (optional)
GEMINI_API_KEY=your_gemini_key
```

### Scanner Go (.env)

```bash
PORT=8001
NODE_BACKEND_URL=http://localhost:8000
REDIS_URL=redis://localhost:6379
CHROME_PATH=/usr/bin/chromium
WORKER_POOL_SIZE=50
MAX_CONCURRENT=100
```

---

## Docker Compose Deployment

### Step 1: Clone and Configure

```bash
git clone https://github.com/your-org/WCAGAII
cd WCAGAII
cp backend/.env.example backend/.env
# Edit backend/.env with your configuration
```

### Step 2: Start Services

```bash
docker-compose up -d
```

This starts:
- ✅ Backend API (port 8000)
- ✅ Scanner Go (port 8001)
- ✅ Redis (port 6379)
- ✅ PostgreSQL (port 5432)
- ✅ Prometheus (port 9090)
- ✅ Grafana (port 3000)

### Step 3: Run Database Migrations

```bash
docker-compose exec backend npm run prisma:migrate
```

### Step 4: Verify Deployment

```bash
# Health check
curl http://localhost:8000/health

# Metrics
curl http://localhost:8000/metrics

# API documentation
open http://localhost:8000/api-docs
```

---

## Kubernetes Deployment

### Step 1: Create Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

### Step 2: Configure Secrets

```bash
# Copy template
cp k8s/secrets.yaml.template k8s/secrets.yaml

# Edit secrets.yaml with real values
nano k8s/secrets.yaml

# Apply secrets
kubectl apply -f k8s/secrets.yaml
```

### Step 3: Deploy ConfigMap

```bash
kubectl apply -f k8s/configmap.yaml
```

### Step 4: Deploy Storage

```bash
kubectl apply -f k8s/pvc.yaml
```

### Step 5: Deploy Application

```bash
# Deploy backend
kubectl apply -f k8s/deployment.yaml

# Deploy service
kubectl apply -f k8s/service.yaml

# Deploy HPA (auto-scaling)
kubectl apply -f k8s/hpa.yaml

# Deploy ingress
kubectl apply -f k8s/ingress.yaml
```

### Step 6: Verify Deployment

```bash
# Check pods
kubectl get pods -n wcagai

# Check services
kubectl get svc -n wcagai

# Check HPA status
kubectl get hpa -n wcagai

# View logs
kubectl logs -f deployment/wcagai-backend -n wcagai
```

### Step 7: Database Migrations

```bash
# Run migrations in pod
kubectl exec -it deployment/wcagai-backend -n wcagai -- npm run prisma:migrate
```

---

## Cloud Platform Deployment

### Railway (Backend)

1. **Install Railway CLI**:
```bash
npm install -g @railway/cli
```

2. **Login**:
```bash
railway login
```

3. **Initialize Project**:
```bash
cd backend
railway init
```

4. **Set Environment Variables**:
```bash
railway variables set NODE_ENV=production
railway variables set DATABASE_URL=postgresql://...
railway variables set REDIS_URL=redis://...
# ... all other variables
```

5. **Deploy**:
```bash
railway up
```

6. **Configure Domain**:
```bash
railway domain
```

### Vercel (Frontend - if applicable)

1. **Install Vercel CLI**:
```bash
npm install -g vercel
```

2. **Deploy**:
```bash
cd frontend
vercel --prod
```

3. **Configure Environment**:
```bash
vercel env add NEXT_PUBLIC_BACKEND_URL production
# Enter: https://your-backend-url.railway.app
```

### CloudFlare (CDN + HTTP/3)

1. **Add Domain**:
   - Go to CloudFlare dashboard
   - Add your domain
   - Update nameservers at your registrar

2. **Enable HTTP/3**:
   - Navigate to Network settings
   - Enable "HTTP/3 (with QUIC)"
   - Enable "0-RTT Connection Resumption"

3. **Configure DNS**:
   - Add A record: `api` → Your backend IP
   - Add CNAME: `www` → Your domain

4. **SSL/TLS**:
   - Set to "Full (strict)"
   - Enable "Always Use HTTPS"

5. **Get API Credentials**:
   - Go to Profile → API Tokens
   - Create token with "Edit Zone" permissions
   - Add token to `CLOUDFLARE_API_TOKEN` env var

---

## Post-Deployment Configuration

### 1. Database Setup

```bash
# Connect to database
psql $DATABASE_URL

# Verify tables
\dt

# Check data
SELECT * FROM users LIMIT 5;
```

### 2. Redis Setup

```bash
# Connect to Redis
redis-cli -u $REDIS_URL

# Test cache
SET test "Hello"
GET test

# Check cluster status (if using cluster)
CLUSTER INFO
```

### 3. Create Admin User

```bash
# Using Prisma Studio
npx prisma studio

# Or via API
curl -X POST http://localhost:8000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@wcagai.com",
    "name": "Admin",
    "plan": "enterprise"
  }'
```

### 4. Configure CDN Cache Rules

**CloudFlare Page Rules**:
- `/api/*` → Cache Level: Standard, TTL: 5 minutes
- `/api-docs/*` → Cache Level: Standard, TTL: 1 hour
- `/metrics` → Cache Level: Bypass

---

## Monitoring & Observability

### Prometheus

Access: `http://localhost:9090`

**Key Queries**:
```promql
# Request rate
rate(wcagai_scan_total[5m])

# Error rate
rate(wcagai_scan_total{status="error"}[5m])

# Latency p95
histogram_quantile(0.95, wcagai_scan_duration_seconds_bucket)

# Browser pool usage
wcagai_browser_pool_active / wcagai_browser_pool_max_size
```

### Grafana

Access: `http://localhost:3000`
Default credentials: `admin` / `admin`

**Import Dashboards**:
1. Go to Dashboards → Import
2. Upload `grafana-dashboard.json`
3. Select Prometheus data source

### Logs

```bash
# Docker Compose
docker-compose logs -f backend

# Kubernetes
kubectl logs -f deployment/wcagai-backend -n wcagai --tail=100

# Filter by correlation ID
kubectl logs deployment/wcagai-backend -n wcagai | grep "correlation-id-123"
```

### Alerts

Configure Prometheus alerting:

```yaml
# prometheus-alerts.yml
groups:
- name: wcagai
  rules:
  - alert: HighErrorRate
    expr: rate(wcagai_scan_total{status="error"}[5m]) > 0.1
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "High error rate detected"
      description: "Error rate is {{ $value }}%"
```

---

## Troubleshooting

### Backend Not Starting

**Issue**: Port already in use
```bash
# Find process using port 8000
lsof -i :8000

# Kill process
kill -9 <PID>
```

**Issue**: Database connection failed
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check logs
docker-compose logs postgres
```

### Redis Connection Issues

```bash
# Test Redis
redis-cli -u $REDIS_URL ping

# Check Redis logs
docker-compose logs redis

# Flush cache if needed
redis-cli -u $REDIS_URL FLUSHALL
```

### Browser Pool Errors

```bash
# Check Chrome installation
docker-compose exec backend which chromium

# Test Puppeteer
docker-compose exec backend node -e "require('puppeteer').launch({headless: true})"

# Increase memory if OOM
# Edit docker-compose.yml:
#   deploy:
#     resources:
#       limits:
#         memory: 4G
```

### Kubernetes Pod Crashes

```bash
# Check pod status
kubectl describe pod <pod-name> -n wcagai

# Check events
kubectl get events -n wcagai --sort-by='.lastTimestamp'

# Check resource usage
kubectl top pods -n wcagai

# Increase resources if needed
kubectl edit deployment wcagai-backend -n wcagai
```

### HPA Not Scaling

```bash
# Check HPA status
kubectl describe hpa wcagai-backend-hpa -n wcagai

# Check metrics server
kubectl get --raw /apis/metrics.k8s.io/v1beta1/pods

# Install metrics server if missing
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

### CDN Cache Not Working

**CloudFlare**:
```bash
# Test cache status
curl -I https://api.wcagai.com | grep CF-Cache-Status

# Purge cache
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"purge_everything":true}'
```

### HTTP/3 Not Working

```bash
# Test HTTP/3 support
curl -I --http3 https://api.wcagai.com

# Check NGINX QUIC module
nginx -V 2>&1 | grep quic

# Check Alt-Svc header
curl -I https://api.wcagai.com | grep Alt-Svc
```

---

## Performance Tuning

### Node.js Backend

```javascript
// Increase heap size
NODE_OPTIONS=--max-old-space-size=4096

// Enable cluster mode
PM2_INSTANCES=4
```

### PostgreSQL

```sql
-- Increase connection pool
ALTER SYSTEM SET max_connections = 200;

-- Enable query logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_duration = on;

-- Reload config
SELECT pg_reload_conf();
```

### Redis

```bash
# Increase max memory
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Save config
redis-cli CONFIG REWRITE
```

---

## Security Hardening

### 1. Enable HTTPS Only

```nginx
# NGINX
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

### 2. Set Security Headers

```javascript
// helmet.js is already configured
// Additional headers:
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
});
```

### 3. Rate Limiting

```javascript
// Already implemented in server.js
// Adjust limits as needed:
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100, // Reduce for stricter limits
});
```

### 4. API Key Authentication

```javascript
// Implement in middleware
const apiKeyAuth = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  // Verify against database
  const user = await prisma.user.findUnique({
    where: { apiKey }
  });
  if (!user) return res.status(401).json({ error: 'Invalid API key' });
  req.user = user;
  next();
};
```

---

## Backup & Recovery

### Database Backups

```bash
# Automated daily backups
0 2 * * * pg_dump $DATABASE_URL | gzip > /backups/wcagai_$(date +\%Y\%m\%d).sql.gz

# Restore from backup
gunzip < /backups/wcagai_20241108.sql.gz | psql $DATABASE_URL
```

### Redis Backups

```bash
# Enable AOF persistence
redis-cli CONFIG SET appendonly yes
redis-cli CONFIG SET appendfsync everysec

# Manual backup
redis-cli BGSAVE
```

### Application State

```bash
# Export audit logs
kubectl exec deployment/wcagai-backend -n wcagai -- \
  tar czf - /app/logs/audit | kubectl cp - ./audit-backup.tar.gz

# Export scan results
pg_dump $DATABASE_URL --table=scans > scans_backup.sql
```

---

**Last Updated**: November 8, 2024
**Version**: 3.0.0
**Status**: Production Ready ✅
