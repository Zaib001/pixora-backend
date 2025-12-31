import dotenv from "dotenv";
dotenv.config();

export const PORT = process.env.PORT;
export const MONGO_URI = process.env.MONGO_URI;
export const JWT_SECRET = process.env.JWT_SECRET;
export const NODE_ENV = process.env.NODE_ENV;
export const CLIENT_URL = process.env.CLIENT_URL;

// Stripe configuration
export const config = {
    port: PORT,
    mongoUri: MONGO_URI,
    jwtSecret: JWT_SECRET,
    nodeEnv: NODE_ENV,
    clientUrl: CLIENT_URL,
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        proPriceId: process.env.STRIPE_PRO_PRICE_ID,
        enterprisePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    },
    email: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM,
        replyTo: process.env.SMTP_REPLY_TO,
    },
    app: {
        name: process.env.APP_NAME,
        url: process.env.APP_URL,
        supportEmail: process.env.SUPPORT_EMAIL,
    },
};
