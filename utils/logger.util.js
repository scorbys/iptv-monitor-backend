// Production-Ready Logger Utility
const fs = require('fs');
const path = require('path');

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Log levels
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

// Current log level based on environment
const currentLogLevel = isProduction ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG;

const LEVEL_PRIORITY = {
  [LOG_LEVELS.ERROR]: 0,
  [LOG_LEVELS.WARN]: 1,
  [LOG_LEVELS.INFO]: 2,
  [LOG_LEVELS.DEBUG]: 3
};

class Logger {
  constructor(context = 'App') {
    this.context = context;
  }

  shouldLog(level) {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLogLevel];
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';

    return `[${timestamp}] [${level}] [${this.context}] ${message}${metaStr}`;
  }

  error(message, meta = {}) {
    if (!this.shouldLog(LOG_LEVELS.ERROR)) return;

    const formatted = this.formatMessage(LOG_LEVELS.ERROR, message, meta);

    // Always log errors to stderr and file
    console.error(formatted);

    if (isProduction) {
      this.writeToFile(formatted);
    }
  }

  warn(message, meta = {}) {
    if (!this.shouldLog(LOG_LEVELS.WARN)) return;

    const formatted = this.formatMessage(LOG_LEVELS.WARN, message, meta);

    if (isProduction) {
      console.warn(formatted);
      this.writeToFile(formatted);
    } else {
      console.warn(formatted);
    }
  }

  info(message, meta = {}) {
    if (!this.shouldLog(LOG_LEVELS.INFO)) return;

    const formatted = this.formatMessage(LOG_LEVELS.INFO, message, meta);

    if (isProduction) {
      console.log(formatted);
      this.writeToFile(formatted);
    } else {
      console.log(formatted);
    }
  }

  debug(message, meta = {}) {
    if (!this.shouldLog(LOG_LEVELS.DEBUG)) return;

    const formatted = this.formatMessage(LOG_LEVELS.DEBUG, message, meta);
    console.log(formatted);
  }

  writeToFile(message) {
    if (!isProduction) return;

    try {
      const logsDir = path.join(__dirname, '../../logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const logFile = path.join(logsDir, `app-${new Date().toISOString().split('T')[0]}.log`);
      fs.appendFileSync(logFile, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }
}

// Request logger middleware
function requestLogger(req, res, next) {
  const start = Date.now();
  const logger = new Logger('HTTP');

  // Log request
  if (isDevelopment) {
    logger.debug(`${req.method} ${req.path}`, {
      query: req.query,
      ip: req.ip
    });
  }

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const message = `${req.method} ${req.path} ${res.statusCode} - ${duration}ms`;

    if (res.statusCode >= 500) {
      logger.error(message, {
        statusCode: res.statusCode,
        duration,
        ip: req.ip
      });
    } else if (res.statusCode >= 400) {
      logger.warn(message, {
        statusCode: res.statusCode,
        duration
      });
    } else if (duration > 1000) {
      logger.warn(message, {
        statusCode: res.statusCode,
        duration: 'slow'
      });
    } else if (isDevelopment) {
      logger.debug(message, {
        statusCode: res.statusCode,
        duration
      });
    }
  });

  next();
}

// Error logger middleware
function errorLogger(err, req, res, next) {
  const logger = new Logger('ERROR');

  logger.error(err.message, {
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  next(err);
}

// Performance logger
function performanceLogger(label, fn) {
  return async function(...args) {
    const logger = new Logger('PERF');
    const start = Date.now();

    try {
      const result = await fn.apply(this, args);
      const duration = Date.now() - start;

      if (duration > 1000) {
        logger.warn(`${label} completed in ${duration}ms`, {
          duration: 'slow'
        });
      } else if (isDevelopment) {
        logger.debug(`${label} completed in ${duration}ms`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`${label} failed after ${duration}ms`, {
        error: error.message
      });
      throw error;
    }
  };
}

// Clean old log files (run periodically)
function cleanOldLogs(daysToKeep = 7) {
  const logsDir = path.join(__dirname, '../../logs');

  try {
    if (!fs.existsSync(logsDir)) return;

    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

    files.forEach(file => {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old log file: ${file}`);
      }
    });
  } catch (error) {
    console.error('Failed to clean old logs:', error);
  }
}

module.exports = {
  Logger,
  requestLogger,
  errorLogger,
  performanceLogger,
  cleanOldLogs,
  LOG_LEVELS
};
