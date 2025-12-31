// middleware/corsOptions.js
const allowedOrigins = [
  "https://pixora-frontend.vercel.app",
  "https://pixora-frontend-one.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000"
];

export const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked for origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  exposedHeaders: ['x-auth-token'],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};