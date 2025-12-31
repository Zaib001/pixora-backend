export const corsOptions = {
  origin: process.env.CLIENT_URL || "https://pixora-frontend.vercel.app/",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
};
