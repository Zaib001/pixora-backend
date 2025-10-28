import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import { corsOptions } from "./middleware/corsOptions.js";
import { setupLogger } from "./utils/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import routes from "./routes/index.js";

const app = express();


app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet()); 
app.use(cors(corsOptions)); 
app.use(compression()); 
setupLogger(app); 


app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Pixora API 🌌",
    version: "v1.0.0",
    docs: "/api/health",
  });
});

app.use("/api", routes);

app.use(errorHandler);

export default app;
