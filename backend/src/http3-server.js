/**
 * HTTP/3 Server Configuration
 *
 * HTTP/3 uses QUIC protocol for improved performance:
 * - Faster connection establishment
 * - Better loss recovery
 * - Multiplexing without head-of-line blocking
 * - Connection migration
 *
 * Note: Node.js native HTTP/3 support is experimental.
 * Production deployments should use:
 * - Cloudflare (automatic HTTP/3)
 * - NGINX with QUIC support
 * - Caddy server (built-in HTTP/3)
 * - Load balancer with HTTP/3 (AWS ALB, GCP HTTPS LB)
 */

const fs = require('fs');
const path = require('path');

/**
 * HTTP/3 Configuration
 */
const HTTP3_CONFIG = {
  enabled: process.env.HTTP3_ENABLED === 'true',
  port: parseInt(process.env.HTTP3_PORT) || 443,

  // Certificate paths (required for QUIC)
  cert: process.env.HTTP3_CERT_PATH || '/etc/ssl/certs/server.crt',
  key: process.env.HTTP3_KEY_PATH || '/etc/ssl/private/server.key',

  // QUIC settings
  quic: {
    maxIdleTimeout: 30000, // 30 seconds
    initialMaxStreamsBidi: 100,
    initialMaxStreamsUni: 100,
    maxStreamDataBidiLocal: 1048576, // 1MB
    maxStreamDataBidiRemote: 1048576,
    maxStreamDataUni: 1048576,
    maxData: 10485760, // 10MB
  },

  // Alt-Svc header for HTTP/2 -> HTTP/3 upgrade
  altSvc: {
    enabled: true,
    maxAge: 86400, // 24 hours
  },
};

/**
 * Setup HTTP/3 with NGINX reverse proxy
 *
 * NGINX configuration example (nginx.conf):
 */
const NGINX_HTTP3_CONFIG = `
# HTTP/3 Configuration for WCAGAI Backend
# NGINX version 1.25.0+ with QUIC support required

# Compile NGINX with: --with-http_v3_module --with-http_quic_module

http {
    # Enable QUIC and HTTP/3
    quic_retry on;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    # Early data (0-RTT)
    ssl_early_data on;

    server {
        listen 443 quic reuseport;  # HTTP/3
        listen 443 ssl;              # HTTP/2 fallback

        server_name api.wcagai.com;

        # SSL Certificates
        ssl_certificate /etc/ssl/certs/wcagai.crt;
        ssl_certificate_key /etc/ssl/private/wcagai.key;

        # HTTP/3 Advertisement
        add_header Alt-Svc 'h3=":443"; ma=86400';
        add_header QUIC-Status $quic;  # Debug header

        # QUIC parameters
        quic_gso on;
        quic_active_connection_id_limit 2;

        # Proxy to Node.js backend
        location / {
            proxy_pass http://localhost:8000;
            proxy_http_version 1.1;

            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # HTTP/3 specific headers
            proxy_set_header X-HTTP-Version $server_protocol;
            proxy_set_header X-QUIC-Status $quic;
        }

        # Health check endpoint
        location /health {
            access_log off;
            proxy_pass http://localhost:8000/health;
        }
    }

    # HTTP to HTTPS redirect
    server {
        listen 80;
        server_name api.wcagai.com;
        return 301 https://$server_name$request_uri;
    }
}
`;

/**
 * Setup HTTP/3 with Caddy server
 *
 * Caddyfile example:
 */
const CADDY_HTTP3_CONFIG = `
# Caddyfile for WCAGAI Backend with HTTP/3
# Caddy has built-in HTTP/3 support - no additional config needed!

api.wcagai.com {
    # Automatic HTTPS and HTTP/3
    # Caddy handles this automatically

    # Reverse proxy to Node.js
    reverse_proxy localhost:8000 {
        # Health check
        health_uri /health
        health_interval 10s
        health_timeout 5s

        # Load balancing (if multiple backends)
        lb_policy round_robin
    }

    # CORS headers
    header Access-Control-Allow-Origin https://wcagai.com
    header Access-Control-Allow-Methods "GET, POST, OPTIONS"

    # Security headers
    header X-Frame-Options DENY
    header X-Content-Type-Options nosniff
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"

    # Rate limiting
    rate_limit {
        zone api {
            key {remote_host}
            events 100
            window 1m
        }
    }

    # Logging
    log {
        output file /var/log/caddy/wcagai-access.log
        format json
    }
}
`;

/**
 * HTTP/3 Middleware for Alt-Svc header
 */
function http3AltSvcMiddleware(options = HTTP3_CONFIG) {
  return (req, res, next) => {
    if (!options.enabled || !options.altSvc.enabled) {
      return next();
    }

    // Add Alt-Svc header to advertise HTTP/3 support
    const altSvc = `h3=":${options.port}"; ma=${options.altSvc.maxAge}`;
    res.setHeader('Alt-Svc', altSvc);

    // Add protocol information headers
    res.setHeader('X-Protocol', req.httpVersion);

    next();
  };
}

/**
 * Check if HTTP/3 is available
 */
function isHTTP3Available(req) {
  // Check if request came via HTTP/3
  const protocol = req.headers['x-http-version'] || req.httpVersion;
  return protocol === '3.0' || protocol === 'h3';
}

/**
 * Get HTTP/3 statistics
 */
function getHTTP3Stats() {
  return {
    enabled: HTTP3_CONFIG.enabled,
    port: HTTP3_CONFIG.port,
    altSvcEnabled: HTTP3_CONFIG.altSvc.enabled,
    configuration: 'reverse-proxy', // NGINX or Caddy
    note: 'HTTP/3 requires NGINX 1.25+ or Caddy 2.0+ as reverse proxy',
  };
}

/**
 * CloudFlare HTTP/3 Setup Instructions
 */
const CLOUDFLARE_HTTP3_SETUP = `
# CloudFlare HTTP/3 Setup (Easiest Option!)

## Step 1: Enable HTTP/3 in CloudFlare Dashboard

1. Log in to CloudFlare dashboard
2. Go to your domain (wcagai.com)
3. Navigate to Network settings
4. Enable "HTTP/3 (with QUIC)"
5. Enable "0-RTT Connection Resumption" (optional)

## Step 2: Verify HTTP/3

Test with curl:
$ curl -I --http3 https://api.wcagai.com

Or use Chrome DevTools:
1. Open Network tab
2. Look for "Protocol" column showing "h3"

## Benefits:
- Zero configuration needed on backend
- CloudFlare handles QUIC/HTTP/3 automatically
- Automatic fallback to HTTP/2
- Built-in DDoS protection
- Global CDN with HTTP/3
`;

module.exports = {
  HTTP3_CONFIG,
  NGINX_HTTP3_CONFIG,
  CADDY_HTTP3_CONFIG,
  CLOUDFLARE_HTTP3_SETUP,
  http3AltSvcMiddleware,
  isHTTP3Available,
  getHTTP3Stats,
};
