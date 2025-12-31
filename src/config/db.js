import mongoose from "mongoose";
import { config } from "./env.js";

let isConnected = false;

export const connectDB = async () => {
  if (isConnected) {
    return;
  }

  try {
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });
    isConnected = !!conn.connections[0].readyState;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    if (error.name === 'MongooseServerSelectionError') {
      console.error("❌ DB Connection Error: Could not connect to MongoDB Atlas.");
      console.error("👉 Please ensure your IP address is whitelisted in MongoDB Atlas dashboard.");
      console.error("🔗 Whitelist guide: https://www.mongodb.com/docs/atlas/security-whitelist/");
    } else {
      console.error("❌ DB Connection Error:", error.message);
    }
    // Don't throw if we want the app to start even without DB (optional, but usually we want it to crash)
    throw error;
  }
};

