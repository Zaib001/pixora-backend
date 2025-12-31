import express from "express";
import {
    createCheckoutSession,
    createSubscriptionCheckout,
    getPaymentStatus,
    handleWebhook,
} from "../controllers/paymentController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Protected routes (require authentication)
router.post("/create-checkout-session", protect, createCheckoutSession);
router.post("/create-subscription", protect, createSubscriptionCheckout);
router.get("/status/:sessionId", protect, getPaymentStatus);

// Webhook route (public but verified by Stripe signature)
// NOTE: This must receive raw body, not JSON parsed
router.post("/webhook", express.raw({ type: "application/json" }), handleWebhook);

export default router;
