/**
 * Audit Logging Service
 *
 * Immutable audit trail for security and compliance
 */

const fs = require('fs').promises;
const path = require('path');
const pino = require('pino');

const logger = pino({
  level: 'info'
});

class AuditLogger {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(__dirname, '../../logs/audit');
    this.retentionDays = options.retentionDays || 90;
    this.enabled = options.enabled !== false;

    if (this.enabled) {
      this.ensureLogDirectory();
    }
  }

  async ensureLogDirectory() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to create audit log directory');
    }
  }

  async log(event) {
    if (!this.enabled) return;

    const auditEntry = {
      timestamp: new Date().toISOString(),
      eventId: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...event
    };

    try {
      // Write to daily log file
      const date = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logDir, `audit-${date}.log`);

      await fs.appendFile(
        logFile,
        JSON.stringify(auditEntry) + '\n',
        { encoding: 'utf8' }
      );

      logger.debug({ eventId: auditEntry.eventId }, 'Audit event logged');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to write audit log');
    }
  }

  async logScan(data) {
    await this.log({
      category: 'SCAN',
      action: 'PERFORM_SCAN',
      ...data
    });
  }

  async logAuth(data) {
    await this.log({
      category: 'AUTHENTICATION',
      ...data
    });
  }

  async logSecurityEvent(data) {
    await this.log({
      category: 'SECURITY',
      severity: 'HIGH',
      ...data
    });
  }

  async logConfigChange(data) {
    await this.log({
      category: 'CONFIGURATION',
      ...data
    });
  }

  async logApiAccess(data) {
    await this.log({
      category: 'API_ACCESS',
      ...data
    });
  }

  async cleanup() {
    if (!this.enabled) return;

    try {
      const files = await fs.readdir(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      for (const file of files) {
        if (!file.startsWith('audit-')) continue;

        const filePath = path.join(this.logDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          logger.info({ file }, 'Deleted old audit log');
        }
      }
    } catch (error) {
      logger.error({ error: error.message }, 'Audit log cleanup failed');
    }
  }
}

// Singleton instance
const auditLogger = new AuditLogger({
  enabled: process.env.AUDIT_LOGGING !== 'false'
});

// Cleanup old logs daily
if (auditLogger.enabled) {
  setInterval(() => auditLogger.cleanup(), 24 * 60 * 60 * 1000);
}

module.exports = { AuditLogger, auditLogger };
