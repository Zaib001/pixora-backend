import winston from "winston";
import morgan from "morgan";
import path from "path";
import fs from "fs";


const logDir = "logs";
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);


export const logger = winston.createLogger({
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack }) => {
      return stack
        ? `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`
        : `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
    }),
  ],
});

export const setupLogger = (app) => {
  const stream = {
    write: (message) => logger.http(message.trim()),
  };

  const skip = () => process.env.NODE_ENV === "production" && false;

  app.use(
    morgan(
      process.env.NODE_ENV === "development"
        ? "dev"
        : ':method :url :status :res[content-length] - :response-time ms',
      { stream, skip }
    )
  );
};
