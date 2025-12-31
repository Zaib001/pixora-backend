import User from "../models/User.js";

/**
 * Free Tier Middleware
 * Validates free tier availability and manages free generation logic
 */

/**
 * Check if user can generate content (either has credits or free generations)
 */
export const canGenerate = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Check if user has credits
        const hasCredits = user.credits > 0;

        // Check if user has free generations
        const hasFreeGenerations = user.checkFreeTierAvailability();

        if (!hasCredits && !hasFreeGenerations) {
            return res.status(403).json({
                success: false,
                message: "Insufficient credits. Please purchase credits or upgrade your plan.",
                requiresUpgrade: true,
                freeGenerationsLeft: 0,
                credits: 0,
            });
        }

        // Attach generation info to request
        req.generationInfo = {
            isFreeTier: !hasCredits && hasFreeGenerations,
            hasCredits,
            hasFreeGenerations,
            freeGenerationsLeft: user.freeGenerationsLeft,
            credits: user.credits,
        };

        next();
    } catch (error) {
        console.error("Free tier middleware error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to validate generation eligibility",
            error: error.message,
        });
    }
};

/**
 * Validate free tier status
 */
export const validateFreeTier = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        req.freeTierStatus = {
            available: user.checkFreeTierAvailability(),
            remaining: user.freeGenerationsLeft,
            exhausted: user.isFreeTierExhausted,
            total: 3,
        };

        next();
    } catch (error) {
        console.error("Validate free tier error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to validate free tier status",
            error: error.message,
        });
    }
};

/**
 * Require credits (block free tier)
 */
export const requireCredits = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (user.credits <= 0) {
            return res.status(403).json({
                success: false,
                message: "This feature requires credits. Please purchase credits to continue.",
                requiresUpgrade: true,
                credits: 0,
            });
        }

        next();
    } catch (error) {
        console.error("Require credits error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to validate credits",
            error: error.message,
        });
    }
};

export default {
    canGenerate,
    validateFreeTier,
    requireCredits,
};
