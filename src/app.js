import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan"; // ✅ added
import { corsOptions } from "./middleware/corsOptions.js";
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

// ✅ Core middlewares
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors(corsOptions));
app.use(compression());


// ✅ Morgan setup for API logging
// 'dev' = colored concise logs for development
// You can use 'combined' for Apache-style logs in production
app.use(morgan("dev"));

// ✅ Stripe webhook route (MUST be before express.json() to get raw body)
app.use("/api/payments/webhook", paymentRoutes);

// ✅ Custom Winston / Logger setup
setupLogger(app);

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
