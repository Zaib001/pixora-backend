// middleware/customCors.js
const allowedOrigins = [
    "https://pixora-frontend.vercel.app",
    "https://pixora-frontend-one.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000"
];

export const customCors = (req, res, next) => {
    const origin = req.headers.origin;

    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token, Accept');
        res.setHeader('Access-Control-Expose-Headers', 'x-auth-token');
        res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    }

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
};