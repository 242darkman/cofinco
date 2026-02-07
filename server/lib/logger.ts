/**
 * Centralized Logger with Pino
 * ============================
 *
 * Logger centralisé haute performance pour l'application COFINCO.
 * Basé sur Pino pour des performances optimales en production.
 *
 * ## Caractéristiques:
 * - Performances ultra-rapides (Pino est ~5x plus rapide que Winston)
 * - Mode JSON structuré pour production (compatible ELK/Datadog)
 * - Mode pretty pour développement (pino-pretty)
 * - Niveaux de log configurables
 * - Contexte de service (child loggers)
 * - Request tracing avec correlation ID
 * - Redaction automatique des données sensibles
 * - Métriques de performance intégrées
 *
 * ## Utilisation:
 * ```typescript
 * import { logger, createLogger, loggers } from '../lib/logger';
 *
 * // Logger principal
 * logger.info('Application started');
 *
 * // Logger spécifique à un service
 * const authLogger = createLogger('Auth');
 * authLogger.info('User logged in', { userId: '123' });
 *
 * // Ou utiliser les loggers pré-configurés
 * loggers.caisse.info('Transaction completed');
 * ```
 */

import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';

// Types
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LoggerConfig {
  level: LogLevel;
  prettyPrint: boolean;
  redact: string[];
}

// Environment configuration
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const logLevel = (process.env.LOG_LEVEL as LogLevel) || (isProduction ? 'info' : 'debug');

// Sensitive fields to redact in logs
const REDACTED_FIELDS = [
  'password',
  'pin',
  'secret',
  'token',
  'authorization',
  'cookie',
  'creditCard',
  'cardNumber',
  'cvv',
  'ssn',
  'apiKey',
  'privateKey',
  '*.password',
  '*.pin',
  '*.secret',
  '*.token',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

// Custom serializers for common objects
const serializers = {
  // Error serializer
  err: pino.stdSerializers.err,
  error: pino.stdSerializers.err,

  // Request serializer (for HTTP logging)
  req: (req: any) => ({
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    params: req.params,
    headers: {
      'user-agent': req.headers?.['user-agent'],
      'content-type': req.headers?.['content-type'],
      'x-request-id': req.headers?.['x-request-id'],
    },
    remoteAddress: req.ip || req.remoteAddress,
  }),

  // Response serializer
  res: (res: any) => ({
    statusCode: res.statusCode,
    headers: {
      'content-type': res.getHeader?.('content-type'),
      'content-length': res.getHeader?.('content-length'),
    },
  }),

  // User serializer (avoid logging sensitive data)
  user: (user: any) => ({
    id: user?.id,
    username: user?.username,
    role: user?.role,
    agenceId: user?.agenceId,
  }),
};

// Base logger configuration
const baseConfig: LoggerOptions = {
  level: isTest ? 'silent' : logLevel,
  redact: {
    paths: REDACTED_FIELDS,
    censor: '[REDACTED]',
  },
  serializers,
  base: {
    env: process.env.NODE_ENV || 'development',
    app: 'cofinco',
    version: process.env.APP_VERSION || '1.0.0',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
    }),
  },
};

// Transport configuration
const getTransport = () => {
  if (isTest) {
    return undefined;
  }

  // Development: pretty console output
  if (!isProduction) {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,env,app,version',
        messageFormat: '{service} | {msg}',
        singleLine: false,
      },
    };
  }

  // Production: JSON output to stdout (for container log collectors)
  return undefined;
};

// Create the root logger
const rootLogger = pino({
  ...baseConfig,
  transport: getTransport(),
});

/**
 * Create a child logger for a specific service
 */
export function createLogger(service: string, bindings?: Record<string, any>): PinoLogger {
  return rootLogger.child({ service, ...bindings });
}

/**
 * Main application logger
 */
export const logger = createLogger('App');

/**
 * Pre-configured loggers for common services
 */
export const loggers = {
  auth: createLogger('Auth'),
  rbac: createLogger('RBAC'),
  caisse: createLogger('Caisse'),
  credit: createLogger('Credit'),
  cron: createLogger('Cron'),
  db: createLogger('Database'),
  ws: createLogger('WebSocket'),
  api: createLogger('API'),
  analytics: createLogger('Analytics'),
  hr: createLogger('HR'),
  epargne: createLogger('Epargne'),
  tontine: createLogger('Tontine'),
  notifications: createLogger('Notifications'),
  payments: createLogger('Payments'),
};

/**
 * Request context logger
 * Creates a child logger with request-specific context
 */
export function createRequestLogger(req: any): PinoLogger {
  const requestId = req.headers?.['x-request-id'] || req.id || generateRequestId();
  return rootLogger.child({
    service: 'HTTP',
    requestId,
    method: req.method,
    path: req.path || req.url,
  });
}

/**
 * Generate a simple request ID
 */
function generateRequestId(): string {
  const { randomBytes } = require('crypto');
  return `req_${Date.now().toString(36)}_${randomBytes(4).toString('hex').slice(0, 6)}`;
}

/**
 * Performance timer utility
 */
export class PerformanceTimer {
  private startTime: [number, number];
  private logger: PinoLogger;
  private operation: string;

  constructor(logger: PinoLogger, operation: string) {
    this.startTime = process.hrtime();
    this.logger = logger;
    this.operation = operation;
  }

  /**
   * End the timer and log the duration
   */
  end(extraData?: Record<string, any>): number {
    const [seconds, nanoseconds] = process.hrtime(this.startTime);
    const durationMs = Math.round(seconds * 1000 + nanoseconds / 1000000);

    this.logger.debug({
      msg: `${this.operation} completed`,
      duration: durationMs,
      durationUnit: 'ms',
      ...extraData,
    });

    return durationMs;
  }
}

/**
 * Create a performance timer
 */
export function startTimer(logger: PinoLogger, operation: string): PerformanceTimer {
  return new PerformanceTimer(logger, operation);
}

/**
 * Log wrapper for async operations with automatic error logging
 */
export async function withLogging<T>(
  logger: PinoLogger,
  operation: string,
  fn: () => Promise<T>,
  logSuccess = true
): Promise<T> {
  const timer = startTimer(logger, operation);

  try {
    const result = await fn();
    if (logSuccess) {
      timer.end({ success: true });
    }
    return result;
  } catch (error) {
    timer.end({ success: false });
    logger.error({ err: error, operation }, `${operation} failed`);
    throw error;
  }
}

/**
 * Middleware for Express request logging
 */
export function requestLoggerMiddleware() {
  return (req: any, res: any, next: any) => {
    // Generate request ID if not present
    const requestId = req.headers['x-request-id'] || generateRequestId();
    req.id = requestId;
    res.setHeader('X-Request-ID', requestId);

    // Create request-scoped logger
    req.log = createRequestLogger(req);

    // Log request start
    const startTime = process.hrtime();
    req.log.info({ msg: 'Request started' });

    // Log response on finish
    res.on('finish', () => {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const durationMs = Math.round(seconds * 1000 + nanoseconds / 1000000);

      const logData = {
        msg: 'Request completed',
        statusCode: res.statusCode,
        duration: durationMs,
        durationUnit: 'ms',
        contentLength: res.getHeader('content-length'),
      };

      // Log level based on status code
      if (res.statusCode >= 500) {
        req.log.error(logData);
      } else if (res.statusCode >= 400) {
        req.log.warn(logData);
      } else {
        req.log.info(logData);
      }
    });

    next();
  };
}

/**
 * Structured error logging helper
 */
export function logError(
  logger: PinoLogger,
  error: Error | unknown,
  context?: Record<string, any>
): void {
  if (error instanceof Error) {
    logger.error({
      err: error,
      ...context,
    }, error.message);
  } else {
    logger.error({
      error: String(error),
      ...context,
    }, 'Unknown error occurred');
  }
}

/**
 * Audit log helper for tracking important business events
 */
export function logAudit(
  action: string,
  details: {
    userId?: string;
    entityType?: string;
    entityId?: string;
    changes?: Record<string, any>;
    metadata?: Record<string, any>;
  }
): void {
  const auditLogger = createLogger('Audit');
  auditLogger.info({
    audit: true,
    action,
    ...details,
    timestamp: new Date().toISOString(),
  }, `AUDIT: ${action}`);
}

/**
 * Security event logging
 */
export function logSecurityEvent(
  event: string,
  details: {
    userId?: string;
    ip?: string;
    userAgent?: string;
    success: boolean;
    reason?: string;
    metadata?: Record<string, any>;
  }
): void {
  const securityLogger = createLogger('Security');
  const logFn = details.success ? securityLogger.info.bind(securityLogger) : securityLogger.warn.bind(securityLogger);

  logFn({
    security: true,
    event,
    ...details,
    timestamp: new Date().toISOString(),
  }, `SECURITY: ${event}`);
}

// Export types
export type { PinoLogger as Logger };

// Re-export pino for advanced usage
export { pino };
