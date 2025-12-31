// middleware/cors.js
export const corsMiddleware = (req, res, next) => {
    const allowedOrigins = [
        "https://pixora-frontend.vercel.app",
        "https://pixora-frontend-one.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000"
    ];

    const origin = req.headers.origin;

    // Always set CORS headers for all origins during development
    if (process.env.NODE_ENV === 'development') {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    } else if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token, Accept, X-Requested-With');
    res.setHeader('Access-Control-Expose-Headers', 'x-auth-token');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
};