import mongoose from "mongoose";

let isConnected = false;

export const connectDB = async () => {
  if (isConnected) {
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    isConnected = !!conn.connections[0].readyState;
  } catch (error) {
    console.error("DB Connection Error:", error.message);
    throw error;
  }
};

