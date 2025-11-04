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
import routes from "./routes/index.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();

// ✅ Core middlewares
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(cors(corsOptions));
app.use(compression());

// ✅ Morgan setup for API logging
// 'dev' = colored concise logs for development
// You can use 'combined' for Apache-style logs in production
app.use(morgan("dev"));

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
app.use("/api", routes);

// ✅ Global error handler
app.use(errorHandler);

export default app;
