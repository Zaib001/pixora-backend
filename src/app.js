import express from "express";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { corsMiddleware } from "./middleware/customCors.js"; // Import custom CORS
import { connectDB } from "./config/db.js"; // Import DB connection
import { setupLogger } from "./utils/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import creditRoutes from "./routes/creditRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import contentRoutes from "./routes/contentRoutes.js";
import helpRoutes from "./routes/helpRoutes.js";
import templateRoutes from "./routes/templateRoutes.js";
import promptRoutes from "./routes/promptRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import routes from "./routes/index.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();

// ✅ Initialize database connection
connectDB();

// ✅ 1. CORS middleware - MUST BE FIRST
app.use(corsMiddleware);

// ✅ 2. Security headers (configure helmet properly)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// ✅ 3. Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ 4. Logging
app.use(morgan("combined")); // Use combined format for better logs
setupLogger(app);

// ✅ 5. Compression
app.use(compression());

// ✅ 6. Routes
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Pixora API",
    version: "v1.0.0",
    docs: "/api/health",
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    cors: "enabled"
  });
});

// All API routes
app.use("/api/auth", authRoutes);
app.use("/api/credits", creditRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/help", helpRoutes);
app.use("/api/prompts", promptRoutes);
app.use("/api", publicRoutes);
app.use("/api", routes);

// ✅ 7. Global error handler
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

export default app;
