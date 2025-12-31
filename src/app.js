import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
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

// ✅ 1. CORS FIRST - This is critical!
app.use(cors(corsOptions));

// ✅ 2. Add explicit OPTIONS handler for preflight
app.options('*', cors(corsOptions));

// ✅ 3. Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ✅ 4. Logging
app.use(morgan("dev"));
setupLogger(app);

// ✅ 5. Compression
app.use(compression());

// ✅ 6. Stripe webhook route - MUST be before express.json()
// Create a separate router for webhook that doesn't use JSON parsing
const stripeWebhookRouter = express.Router();
// Import your webhook handler function directly
import { handleStripeWebhook } from "./controllers/paymentController.js";
stripeWebhookRouter.post("/webhook", handleStripeWebhook);
app.use("/api/payments", stripeWebhookRouter);

// ✅ 7. Now parse JSON for all other routes
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ 8. Routes
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
app.use("/api/payments", paymentRoutes); // Other payment routes (not webhook)
app.use("/api/admin", adminRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/help", helpRoutes);
app.use("/api/prompts", promptRoutes);
app.use("/api", publicRoutes);
app.use("/api", routes);

// ✅ 9. Global error handler
app.use(errorHandler);

export default app;