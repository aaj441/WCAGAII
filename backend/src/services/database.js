/**
 * Database Service with Read Replica Support
 *
 * Features:
 * - Primary database for writes
 * - Read replicas for read operations
 * - Automatic load balancing
 * - Retry logic with exponential backoff
 * - Connection pooling
 * - Health monitoring
 */

const { PrismaClient } = require('@prisma/client');
const { CircuitBreakerManager } = require('./circuitBreaker');

class DatabaseService {
  constructor() {
    // Primary database (for writes)
    this.primary = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

    // Read replicas
    this.replicas = this.initializeReplicas();
    this.currentReplicaIndex = 0;

    // Circuit breakers
    this.primaryBreaker = CircuitBreakerManager.getBreaker('database-primary', {
      failureThreshold: 5,
      resetTimeout: 30000,
    });

    this.replicaBreaker = CircuitBreakerManager.getBreaker('database-replica', {
      failureThreshold: 3,
      resetTimeout: 20000,
    });

    // Metrics
    this.metrics = {
      writes: 0,
      reads: 0,
      errors: 0,
      replicaFailovers: 0,
    };

    // Connect
    this.connect();
  }

  /**
   * Initialize read replicas from environment
   */
  initializeReplicas() {
    const replicaUrls = process.env.DATABASE_REPLICA_URLS;
    if (!replicaUrls) {
      console.log('[Database] No read replicas configured, using primary for all reads');
      return [];
    }

    const urls = replicaUrls.split(',').map(url => url.trim());
    console.log(`[Database] Initializing ${urls.length} read replica(s)`);

    return urls.map((url, index) => ({
      id: `replica-${index}`,
      client: new PrismaClient({
        datasources: {
          db: { url },
        },
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      }),
      healthy: true,
      lastCheck: Date.now(),
    }));
  }

  /**
   * Connect to all databases
   */
  async connect() {
    try {
      await this.primary.$connect();
      console.log('[Database] Primary connected');

      // Connect replicas
      for (const replica of this.replicas) {
        try {
          await replica.client.$connect();
          console.log(`[Database] ${replica.id} connected`);
        } catch (error) {
          console.error(`[Database] ${replica.id} connection failed:`, error.message);
          replica.healthy = false;
        }
      }
    } catch (error) {
      console.error('[Database] Primary connection failed:', error);
      throw error;
    }
  }

  /**
   * Get read client (replica or primary fallback)
   */
  getReadClient() {
    if (this.replicas.length === 0) {
      return this.primary;
    }

    // Round-robin load balancing
    const healthyReplicas = this.replicas.filter(r => r.healthy);

    if (healthyReplicas.length === 0) {
      console.warn('[Database] No healthy replicas, falling back to primary');
      this.metrics.replicaFailovers++;
      return this.primary;
    }

    const replica = healthyReplicas[this.currentReplicaIndex % healthyReplicas.length];
    this.currentReplicaIndex++;

    return replica.client;
  }

  /**
   * Execute write operation
   */
  async write(operation) {
    this.metrics.writes++;

    try {
      return await this.primaryBreaker.execute(async () => {
        return await operation(this.primary);
      });
    } catch (error) {
      this.metrics.errors++;
      console.error('[Database] Write error:', error.message);
      throw error;
    }
  }

  /**
   * Execute read operation
   */
  async read(operation) {
    this.metrics.reads++;

    try {
      const client = this.getReadClient();
      return await this.replicaBreaker.execute(async () => {
        return await operation(client);
      }, async () => {
        // Fallback to primary if replica fails
        console.warn('[Database] Replica circuit open, using primary');
        this.metrics.replicaFailovers++;
        return await operation(this.primary);
      });
    } catch (error) {
      this.metrics.errors++;
      console.error('[Database] Read error:', error.message);
      throw error;
    }
  }

  /**
   * Health check for all databases
   */
  async healthCheck() {
    const results = {
      primary: { healthy: false, latency: 0 },
      replicas: [],
    };

    // Check primary
    try {
      const start = Date.now();
      await this.primary.$queryRaw`SELECT 1`;
      results.primary.healthy = true;
      results.primary.latency = Date.now() - start;
    } catch (error) {
      results.primary.error = error.message;
    }

    // Check replicas
    for (const replica of this.replicas) {
      try {
        const start = Date.now();
        await replica.client.$queryRaw`SELECT 1`;
        replica.healthy = true;
        replica.lastCheck = Date.now();
        results.replicas.push({
          id: replica.id,
          healthy: true,
          latency: Date.now() - start,
        });
      } catch (error) {
        replica.healthy = false;
        replica.lastCheck = Date.now();
        results.replicas.push({
          id: replica.id,
          healthy: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get database statistics
   */
  getStats() {
    const total = this.metrics.reads + this.metrics.writes;
    const healthyReplicas = this.replicas.filter(r => r.healthy).length;

    return {
      writes: this.metrics.writes,
      reads: this.metrics.reads,
      total,
      errors: this.metrics.errors,
      errorRate: total > 0 ? (this.metrics.errors / total * 100).toFixed(2) + '%' : '0%',
      replicas: {
        total: this.replicas.length,
        healthy: healthyReplicas,
        failovers: this.metrics.replicaFailovers,
      },
    };
  }

  /**
   * Disconnect all databases
   */
  async disconnect() {
    await this.primary.$disconnect();

    for (const replica of this.replicas) {
      await replica.client.$disconnect();
    }

    console.log('[Database] All connections closed');
  }
}

// Repository patterns for each model

class ScanRepository {
  constructor(db) {
    this.db = db;
  }

  async create(data) {
    return this.db.write(client => client.scan.create({ data }));
  }

  async findById(id) {
    return this.db.read(client => client.scan.findUnique({ where: { id } }));
  }

  async findByUserId(userId, options = {}) {
    return this.db.read(client => client.scan.findMany({
      where: { userId },
      orderBy: { scanDate: 'desc' },
      take: options.limit || 50,
      skip: options.offset || 0,
    }));
  }

  async findRecent(limit = 100) {
    return this.db.read(client => client.scan.findMany({
      orderBy: { scanDate: 'desc' },
      take: limit,
    }));
  }

  async getStatsByDateRange(startDate, endDate) {
    return this.db.read(client => client.scan.groupBy({
      by: ['wcagLevel'],
      where: {
        scanDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: true,
      _avg: {
        violationsCount: true,
        duration: true,
      },
    }));
  }

  async update(id, data) {
    return this.db.write(client => client.scan.update({
      where: { id },
      data,
    }));
  }

  async delete(id) {
    return this.db.write(client => client.scan.delete({ where: { id } }));
  }
}

class UserRepository {
  constructor(db) {
    this.db = db;
  }

  async create(data) {
    return this.db.write(client => client.user.create({ data }));
  }

  async findById(id) {
    return this.db.read(client => client.user.findUnique({ where: { id } }));
  }

  async findByEmail(email) {
    return this.db.read(client => client.user.findUnique({ where: { email } }));
  }

  async findByApiKey(apiKey) {
    return this.db.read(client => client.user.findUnique({ where: { apiKey } }));
  }

  async update(id, data) {
    return this.db.write(client => client.user.update({
      where: { id },
      data,
    }));
  }

  async incrementRequestCount(id) {
    return this.db.write(client => client.user.update({
      where: { id },
      data: { requestCount: { increment: 1 } },
    }));
  }
}

class AuditLogRepository {
  constructor(db) {
    this.db = db;
  }

  async create(data) {
    return this.db.write(client => client.auditLog.create({ data }));
  }

  async findByUserId(userId, options = {}) {
    return this.db.read(client => client.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: options.limit || 100,
      skip: options.offset || 0,
    }));
  }

  async findByCorrelationId(correlationId) {
    return this.db.read(client => client.auditLog.findMany({
      where: { correlationId },
      orderBy: { timestamp: 'asc' },
    }));
  }

  async findByDateRange(startDate, endDate, filters = {}) {
    return this.db.read(client => client.auditLog.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
        ...filters,
      },
      orderBy: { timestamp: 'desc' },
    }));
  }
}

// Singleton instance
let dbInstance = null;

function getDatabaseService() {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}

function getRepositories() {
  const db = getDatabaseService();
  return {
    scans: new ScanRepository(db),
    users: new UserRepository(db),
    auditLogs: new AuditLogRepository(db),
  };
}

module.exports = {
  DatabaseService,
  getDatabaseService,
  getRepositories,
  ScanRepository,
  UserRepository,
  AuditLogRepository,
};
