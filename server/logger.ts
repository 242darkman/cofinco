import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Logs directory - will be created automatically if it doesn't exist
const logsDir = process.env.LOGS_DIR || path.join(process.cwd(), 'logs');

// Custom format for readable logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, source, ...meta }) => {
    const src = source ? `[${source}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level.toUpperCase()} ${src} ${message}${metaStr}`;
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, source, error, ...meta }) => {
    const src = source ? `[${source}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const errStr = error ? `\n${error}` : '';
    return `${timestamp} ${level} ${src} ${message}${metaStr}${errStr}`;
  })
);

// Daily rotate file transport - one file per day, keep 30 days
const dailyRotateTransport = new DailyRotateFile({
  dirname: logsDir,
  filename: 'app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,           // Compress old logs
  maxSize: '20m',                // Max 20MB per file
  maxFiles: '30d',               // Keep logs for 30 days (monthly rotation)
  createSymlink: true,           // Create symlink to current log
  symlinkName: 'app-current.log',
});

// Error-specific logs
const errorRotateTransport = new DailyRotateFile({
  dirname: logsDir,
  filename: 'error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  createSymlink: true,
  symlinkName: 'error-current.log',
});

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    dailyRotateTransport,
    errorRotateTransport,
  ],
  exceptionHandlers: [
    new DailyRotateFile({
      dirname: logsDir,
      filename: 'exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '30d',
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      dirname: logsDir,
      filename: 'rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '30d',
    }),
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// Helper function matching the existing log signature
export function log(message: string, source = 'express') {
  logger.info(message, { source });
}

// Additional logging methods for convenience
export function logError(message: string, error?: Error, source = 'express') {
  logger.error(message, { source, error: error?.stack || error?.message });
}

export function logWarn(message: string, source = 'express') {
  logger.warn(message, { source });
}

export function logDebug(message: string, source = 'express') {
  logger.debug(message, { source });
}

export default logger;
