import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import { customCors } from "./middleware/customCors.js"; // Import custom CORS
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

// ✅ Use custom CORS middleware FIRST
app.use(customCors);

// ✅ Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false // Disable CSP if it causes issues
}));

// ✅ Logging
app.use(morgan("dev"));
setupLogger(app);

// ✅ Compression
app.use(compression());

// ✅ Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ Routes
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Pixora API",
    version: "v1.0.0",
    docs: "/api/health",
  });
});

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

// ✅ Global error handler
app.use(errorHandler);

export default app;