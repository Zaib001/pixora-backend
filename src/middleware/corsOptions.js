const allowedOrigins = [
  "https://pixora-frontend.vercel.app",
  "https://pixora-frontend-one.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000"
];

export const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 ||
      (process.env.CLIENT_URL && origin === process.env.CLIENT_URL)) {
      callback(null, true);
    } else {
      console.log('CORS blocked for origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'Accept'],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11) choke on 204
  preflightContinue: false,
  maxAge: 86400 // 24 hours
};