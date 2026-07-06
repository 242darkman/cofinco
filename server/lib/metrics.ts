/**
 * Prometheus Metrics for MICROFLEX
 * ===============================
 *
 * Métriques exposées via /api/metrics pour Prometheus.
 *
 * Métriques incluses:
 * - HTTP request duration histogram
 * - HTTP request counter by status/method/route
 * - Active connections gauge
 * - Business metrics (transactions, sessions, etc.)
 */

import client, {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics
} from 'prom-client';
import type { Express, Request, Response, NextFunction } from 'express';
import { createLogger } from './logger';

const logger = createLogger('Metrics');

// Create a custom registry
export const metricsRegistry = new Registry();

// Add default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'microflex_',
});

// =============================================================================
// HTTP METRICS
// =============================================================================

// HTTP request duration histogram
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

// HTTP requests total counter
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

// Active HTTP connections
export const httpActiveConnections = new Gauge({
  name: 'http_active_connections',
  help: 'Number of active HTTP connections',
  registers: [metricsRegistry],
});

// =============================================================================
// BUSINESS METRICS
// =============================================================================

// Active caisse sessions
export const activeCaisseSessions = new Gauge({
  name: 'microflex_caisse_sessions_active',
  help: 'Number of active caisse sessions',
  registers: [metricsRegistry],
});

// Daily transactions counter
export const dailyTransactions = new Counter({
  name: 'microflex_transactions_daily_total',
  help: 'Total number of transactions today',
  labelNames: ['type', 'method'],
  registers: [metricsRegistry],
});

// Transaction amount histogram
export const transactionAmount = new Histogram({
  name: 'microflex_transaction_amount_fcfa',
  help: 'Transaction amounts in FCFA',
  labelNames: ['type'],
  buckets: [1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000, 10000000],
  registers: [metricsRegistry],
});

// WebSocket connections
export const wsConnections = new Gauge({
  name: 'microflex_websocket_connections',
  help: 'Number of active WebSocket connections',
  registers: [metricsRegistry],
});

// Pending credit requests
export const pendingCreditRequests = new Gauge({
  name: 'microflex_credit_requests_pending',
  help: 'Number of pending credit requests',
  registers: [metricsRegistry],
});

// Active monitoring alerts
export const monitoringAlerts = new Gauge({
  name: 'microflex_monitoring_alerts_active',
  help: 'Number of active monitoring alerts',
  labelNames: ['severity'],
  registers: [metricsRegistry],
});

// Database query duration
export const dbQueryDuration = new Histogram({
  name: 'microflex_db_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [metricsRegistry],
});

// =============================================================================
// GL GUARD METRICS (Caisse Opening Security)
// =============================================================================

// Caisse openings blocked due to GL discrepancy
export const caisseOpeningBlocked = new Counter({
  name: 'microflex_caisse_opening_blocked_total',
  help: 'Number of caisse openings blocked due to GL discrepancy',
  labelNames: ['agence_id', 'strictness_mode'],
  registers: [metricsRegistry],
});

// Caisse openings with discrepancy (not blocked)
export const caisseOpeningDiscrepancy = new Counter({
  name: 'microflex_caisse_opening_discrepancy_total',
  help: 'Number of caisse openings with GL discrepancy (allowed)',
  labelNames: ['agence_id', 'strictness_mode', 'action'],
  registers: [metricsRegistry],
});

// GL discrepancy amount histogram
export const glDiscrepancyAmount = new Histogram({
  name: 'microflex_gl_discrepancy_amount_fcfa',
  help: 'GL discrepancy amounts at caisse opening in FCFA',
  labelNames: ['strictness_mode'],
  buckets: [1000, 5000, 10000, 50000, 100000, 500000, 1000000],
  registers: [metricsRegistry],
});

// =============================================================================
// CRON JOB METRICS
// =============================================================================

// Late installments marked count
export const lateInstallmentsMarked = new Gauge({
  name: 'microflex_late_installments_marked',
  help: 'Number of installments marked as late in the last run',
  registers: [metricsRegistry],
});

// Late credits count
export const lateCreditsCount = new Gauge({
  name: 'microflex_late_credits_count',
  help: 'Number of credits with late installments found in the last run',
  registers: [metricsRegistry],
});

// Late installments job duration
export const lateInstallmentsJobDuration = new Histogram({
  name: 'microflex_late_installments_job_duration_ms',
  help: 'Duration of the late installments job in milliseconds',
  buckets: [100, 500, 1000, 5000, 10000],
  registers: [metricsRegistry],
});

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Express middleware for collecting HTTP metrics
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip metrics endpoint itself
    if (req.path === '/api/metrics') {
      return next();
    }

    httpActiveConnections.inc();
    const startTime = process.hrtime.bigint();

    res.on('finish', () => {
      httpActiveConnections.dec();

      const endTime = process.hrtime.bigint();
      const durationSeconds = Number(endTime - startTime) / 1e9;

      // Normalize route for label (avoid high cardinality)
      const route = normalizeRoute(req.route?.path || req.path);

      const labels = {
        method: req.method,
        route,
        status_code: res.statusCode.toString(),
      };

      httpRequestDuration.observe(labels, durationSeconds);
      httpRequestsTotal.inc(labels);
    });

    next();
  };
}

/**
 * Normalize route paths to avoid high cardinality
 */
function normalizeRoute(path: string): string {
  // Replace UUIDs
  let normalized = path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );
  // Replace numeric IDs
  normalized = normalized.replace(/\/\d+/g, '/:id');
  // Replace long hex strings
  normalized = normalized.replace(/\/[0-9a-f]{24,}/gi, '/:id');

  return normalized || '/';
}

// =============================================================================
// ROUTE HANDLER
// =============================================================================

/**
 * Register the /api/metrics endpoint
 */
export function registerMetricsRoute(app: Express): void {
  app.get('/api/metrics', async (req, res) => {
    try {
      res.set('Content-Type', metricsRegistry.contentType);
      const metrics = await metricsRegistry.metrics();
      res.send(metrics);
    } catch (error) {
      logger.error({ err: error }, 'Error generating metrics');
      res.status(500).send('Error generating metrics');
    }
  });

  logger.info('Metrics endpoint registered at /api/metrics');
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Record a business transaction metric
 */
export function recordTransaction(type: string, method: string, amount: number): void {
  dailyTransactions.inc({ type, method });
  transactionAmount.observe({ type }, amount);
}

/**
 * Update active sessions count
 */
export function updateSessionsCount(count: number): void {
  activeCaisseSessions.set(count);
}

/**
 * Update WebSocket connections count
 */
export function updateWsConnections(count: number): void {
  wsConnections.set(count);
}

/**
 * Update monitoring alerts count
 */
export function updateAlertsCounts(counts: { critical: number; warning: number; info: number }): void {
  monitoringAlerts.set({ severity: 'critical' }, counts.critical);
  monitoringAlerts.set({ severity: 'warning' }, counts.warning);
  monitoringAlerts.set({ severity: 'info' }, counts.info);
}

/**
 * Time a database query
 */
export function timeDbQuery(operation: string): () => void {
  const startTime = process.hrtime.bigint();
  return () => {
    const endTime = process.hrtime.bigint();
    const durationSeconds = Number(endTime - startTime) / 1e9;
    dbQueryDuration.observe({ operation }, durationSeconds);
  };
}

/**
 * Record GL Guard metrics for caisse opening
 */
export function recordGlGuardEvent(params: {
  action: 'BLOCKED' | 'APPROVED_WITH_JUSTIFICATION' | 'LOGGED_ONLY';
  agenceId: string;
  strictnessMode: string;
  discrepancyAmount: number;
}): void {
  const { action, agenceId, strictnessMode, discrepancyAmount } = params;

  if (action === 'BLOCKED') {
    caisseOpeningBlocked.inc({ agence_id: agenceId, strictness_mode: strictnessMode });
  } else {
    caisseOpeningDiscrepancy.inc({
      agence_id: agenceId,
      strictness_mode: strictnessMode,
      action,
    });
  }

  // Record discrepancy amount histogram
  if (discrepancyAmount > 0) {
    glDiscrepancyAmount.observe({ strictness_mode: strictnessMode }, discrepancyAmount);
  }
}

export default {
  metricsRegistry,
  metricsMiddleware,
  registerMetricsRoute,
  recordTransaction,
  updateSessionsCount,
  updateWsConnections,
  updateAlertsCounts,
  timeDbQuery,
  recordGlGuardEvent,
};
