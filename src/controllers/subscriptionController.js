import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import stripe from "../config/stripeConfig.js";

// @desc    Get user's current subscription
// @route   GET /api/subscriptions
// @access  Private
export const getUserSubscription = async (req, res) => {
    try {
        const userId = req.user.id;

        const subscription = await Subscription.findActiveByUser(userId);

        if (!subscription) {
            return res.status(200).json({
                success: true,
                data: {
                    hasSubscription: false,
                    plan: "free",
                    status: "inactive",
                },
                message: "No active subscription found.",
            });
        }

        res.status(200).json({
            success: true,
            data: {
                hasSubscription: true,
                subscription: {
                    id: subscription.id,
                    plan: subscription.plan,
                    status: subscription.status,
                    amount: subscription.amount,
                    currency: subscription.currency,
                    interval: subscription.interval,
                    currentPeriodStart: subscription.currentPeriodStart,
                    currentPeriodEnd: subscription.currentPeriodEnd,
                    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                    monthlyCredits: subscription.monthlyCredits,
                    daysUntilRenewal: subscription.daysUntilRenewal,
                },
            },
        });
    } catch (error) {
        console.error("Get User Subscription Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve subscription.",
            error: error.message,
        });
    }
};

// @desc    Cancel user's subscription
// @route   POST /api/subscriptions/cancel
// @access  Private
export const cancelSubscription = async (req, res) => {
    try {
        const userId = req.user.id;
        const { immediately = false, reason = "" } = req.body;

        const subscription = await Subscription.findActiveByUser(userId);

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: "No active subscription found.",
            });
        }

        // Cancel in Stripe
        const stripeSubscription = await stripe.subscriptions.update(
            subscription.stripeSubscriptionId,
            {
                cancel_at_period_end: !immediately,
                ...(immediately && { cancel_at: "now" }),
            }
        );

        // Update local subscription
        await subscription.cancel(reason, immediately);

        // Update user
        if (immediately) {
            const user = await User.findById(userId);
            user.subscriptionStatus = "inactive";
            user.subscriptionPlan = "free";
            await user.save();
        }

        res.status(200).json({
            success: true,
            data: {
                subscription: {
                    id: subscription.id,
                    status: subscription.status,
                    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                    endsAt: immediately ? new Date() : subscription.currentPeriodEnd,
                },
            },
            message: immediately
                ? "Subscription canceled immediately."
                : "Subscription will cancel at period end.",
        });
    } catch (error) {
        console.error("Cancel Subscription Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to cancel subscription.",
            error: error.message,
        });
    }
};

// @desc    Reactivate a canceled subscription
// @route   POST /api/subscriptions/reactivate
// @access  Private
export const reactivateSubscription = async (req, res) => {
    try {
        const userId = req.user.id;

        const subscription = await Subscription.findOne({
            user: userId,
            cancelAtPeriodEnd: true,
            status: "active",
        });

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: "No cancelable subscription found.",
            });
        }

        // Reactivate in Stripe
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            cancel_at_period_end: false,
        });

        // Reactivate locally
        await subscription.reactivate();

        res.status(200).json({
            success: true,
            data: {
                subscription: {
                    id: subscription.id,
                    status: subscription.status,
                    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                },
            },
            message: "Subscription reactivated successfully.",
        });
    } catch (error) {
        console.error("Reactivate Subscription Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to reactivate subscription.",
            error: error.message,
        });
    }
};

// @desc    Update subscription plan
// @route   PATCH /api/subscriptions/update
// @access  Private
export const updateSubscriptionPlan = async (req, res) => {
    try {
        const userId = req.user.id;
        const { newPlanId } = req.body;

        const subscription = await Subscription.findActiveByUser(userId);

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: "No active subscription found.",
            });
        }

        // Get new plan details
        const newPlan = getSubscriptionPlan(newPlanId);
        if (!newPlan) {
            return res.status(400).json({
                success: false,
                message: "Invalid plan selected.",
            });
        }

        // Update subscription in Stripe
        const stripeSubscription = await stripe.subscriptions.retrieve(
            subscription.stripeSubscriptionId
        );

        const updatedSubscription = await stripe.subscriptions.update(
            subscription.stripeSubscriptionId,
            {
                items: [
                    {
                        id: stripeSubscription.items.data[0].id,
                        price: newPlan.stripePriceId,
                    },
                ],
                proration_behavior: "always_invoice",
            }
        );

        // Update local subscription
        subscription.plan = newPlanId;
        subscription.stripePriceId = newPlan.stripePriceId;
        subscription.amount = newPlan.price;
        subscription.monthlyCredits = newPlan.credits;
        await subscription.save();

        // Update user
        const user = await User.findById(userId);
        user.subscriptionPlan = newPlanId;
        await user.save();

        res.status(200).json({
            success: true,
            data: {
                subscription: {
                    id: subscription.id,
                    plan: subscription.plan,
                    amount: subscription.amount,
                    monthlyCredits: subscription.monthlyCredits,
                },
            },
            message: "Subscription plan updated successfully.",
        });
    } catch (error) {
        console.error("Update Subscription Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update subscription.",
            error: error.message,
        });
    }
};

// @desc    Get all subscriptions (Admin)
// @route   GET /api/admin/subscriptions
// @access  Private/Admin
export const getAllSubscriptions = async (req, res) => {
    try {
        const { status, plan, page = 1, limit = 50 } = req.query;

        const query = {};
        if (status) query.status = status;
        if (plan) query.plan = plan;

        const subscriptions = await Subscription.find(query)
            .populate("user", "name email")
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await Subscription.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                subscriptions,
                totalPages: Math.ceil(count / limit),
                currentPage: page,
                total: count,
            },
        });
    } catch (error) {
        console.error("Get All Subscriptions Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve subscriptions.",
            error: error.message,
        });
    }
};

// @desc    Get subscription statistics (Admin)
// @route   GET /api/admin/subscriptions/stats
// @access  Private/Admin
export const getSubscriptionStats = async (req, res) => {
    try {
        const stats = await Subscription.getStats();

        const totalSubscriptions = await Subscription.countDocuments();
        const activeSubscriptions = await Subscription.countDocuments({
            status: { $in: ["active", "trialing"] },
        });

        res.status(200).json({
            success: true,
            data: {
                totalSubscriptions,
                activeSubscriptions,
                planBreakdown: stats,
            },
        });
    } catch (error) {
        console.error("Get Subscription Stats Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve statistics.",
            error: error.message,
        });
    }
};
