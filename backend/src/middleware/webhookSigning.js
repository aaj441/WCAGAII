/**
 * Webhook Request Signing
 *
 * HMAC-SHA256 signatures for webhook security
 */

const crypto = require('crypto');

class WebhookSigner {
  constructor(secret) {
    this.secret = secret || process.env.WEBHOOK_SECRET || 'default-webhook-secret-change-me';
  }

  sign(payload) {
    const timestamp = Date.now();
    const data = `${timestamp}.${JSON.stringify(payload)}`;

    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');

    return {
      signature: `t=${timestamp},v1=${signature}`,
      timestamp
    };
  }

  verify(payload, signatureHeader, tolerance = 300000) {
    // Parse signature header: t=timestamp,v1=signature
    const parts = signatureHeader.split(',');
    const timestamp = parseInt(parts[0].split('=')[1]);
    const expectedSignature = parts[1].split('=')[1];

    // Check timestamp tolerance (5 minutes by default)
    const now = Date.now();
    if (Math.abs(now - timestamp) > tolerance) {
      throw new Error('Webhook signature expired');
    }

    // Verify signature
    const data = `${timestamp}.${JSON.stringify(payload)}`;
    const actualSignature = crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');

    if (actualSignature !== expectedSignature) {
      throw new Error('Invalid webhook signature');
    }

    return true;
  }

  middleware() {
    return (req, res, next) => {
      const signature = req.headers['x-webhook-signature'];

      if (!signature) {
        return res.status(401).json({
          error: 'Missing webhook signature'
        });
      }

      try {
        this.verify(req.body, signature);
        next();
      } catch (error) {
        res.status(401).json({
          error: 'Invalid webhook signature',
          message: error.message
        });
      }
    };
  }
}

const signer = new WebhookSigner();

module.exports = { WebhookSigner, signer };
