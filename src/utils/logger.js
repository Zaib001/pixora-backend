// utils/logger.js
import winston from 'winston';

// Create logger that works on Vercel (no file system access)
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console only on Vercel (no file system access)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Setup function for app
export const setupLogger = (app) => {
  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info({
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: `${duration}ms`,
        userAgent: req.get('user-agent')
      });
    });

    next();
  });

  // Global error logging
  app.use((err, req, res, next) => {
    logger.error({
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method
    });
    next(err);
  });
};
