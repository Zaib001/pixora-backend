import Stripe from "stripe";
import { config } from "./env.js";

// Initialize Stripe with secret key
const stripe = new Stripe(config.stripe.secretKey, {
    apiVersion: "2024-12-18.acacia",
    typescript: false,
});

// Credit pack configurations matching frontend
export const creditPacks = {
    1: {
        id: 1,
        credits: 50,
        price: 4.99,
        priceInCents: 499,
        currency: "usd",
        name: "Starter Pack",
        description: "50 credits for basic generation",
    },
    2: {
        id: 2,
        credits: 200,
        price: 17.99,
        priceInCents: 1799,
        currency: "usd",
        name: "Popular Pack",
        description: "200 credits with 10% savings",
        popular: true,
    },
    3: {
        id: 3,
        credits: 1000,
        price: 79.99,
        priceInCents: 7999,
        currency: "usd",
        name: "Pro Pack",
        description: "1000 credits with 20% savings",
    },
};

// Subscription plan configurations matching frontend
export const subscriptionPlans = {
    free: {
        id: "free",
        name: "Free",
        price: 0,
        priceInCents: 0,
        credits: 10,
        interval: "month",
        stripePriceId: null, // No Stripe price for free plan
    },
    pro: {
        id: "pro",
        name: "Pro",
        price: 19,
        priceInCents: 1900,
        credits: 500,
        interval: "month",
        stripePriceId: config.stripe.proPriceId || "price_pro_monthly", // Set in env
        features: [
            "All AI tools",
            "High quality",
            "Priority support",
            "No watermarks",
            "Commercial use",
        ],
    },
    enterprise: {
        id: "enterprise",
        name: "Enterprise",
        price: 99,
        priceInCents: 9900,
        credits: -1, // Unlimited
        interval: "month",
        stripePriceId: config.stripe.enterprisePriceId || "price_enterprise_monthly",
        features: [
            "All Pro features",
            "Ultra quality",
            "Dedicated support",
            "Custom models",
            "API access",
        ],
    },
};

// Helper function to get credit pack by ID
export const getCreditPack = (packId) => {
    return creditPacks[packId] || null;
};

// Helper function to get subscription plan by ID
export const getSubscriptionPlan = (planId) => {
    return subscriptionPlans[planId] || null;
};

// Helper function to validate pack ID
export const isValidCreditPack = (packId) => {
    return creditPacks.hasOwnProperty(packId);
};

// Helper function to validate plan ID
export const isValidSubscriptionPlan = (planId) => {
    return subscriptionPlans.hasOwnProperty(planId) && planId !== "free";
};

export default stripe;
