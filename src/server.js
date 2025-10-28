import app from "./app.js";
import { connectDB } from "./config/db.js";
import { PORT } from "./config/env.js";

const startServer = async () => {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`Pixora backend running on port ${PORT}`);
    });

 
    const shutdown = (signal) => {
      console.log(`\n ${signal} received. Shutting down gracefully...`);
      server.close(() => {
        console.log("Server closed.");
        process.exit(0);
      });
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    console.error("Server initialization failed:", err.message);
    process.exit(1);
  }
};

startServer();
