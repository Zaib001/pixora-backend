import mongoose from "mongoose";
import { config } from "./env.js";

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export const connectDB = async () => {
  if (cached.conn) {
    console.log("✅ MongoDB Connected (Cached)");
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      // bufferCommands: true, // Default is true, enabling buffering to prevent race condition crashes
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    };

    console.log("⏳ Connecting to MongoDB...");
    cached.promise = mongoose.connect(config.mongoUri, opts).then((mongoose) => {
      console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
      return mongoose;
    }).catch(error => {
      console.error("❌ DB Connection Error:", error.message);
      if (error.name === 'MongooseServerSelectionError') {
        console.error("👉 Please ensure your IP address is whitelisted in MongoDB Atlas dashboard.");
      }
      throw error;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
};

