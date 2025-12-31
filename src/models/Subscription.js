import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User is required"],
            index: true,
        },

        stripeSubscriptionId: {
            type: String,
            unique: true,
            required: [true, "Stripe subscription ID is required"],
            index: true,
        },

        stripeCustomerId: {
            type: String,
            required: [true, "Stripe customer ID is required"],
            index: true,
        },

        stripePriceId: {
            type: String,
            required: [true, "Stripe price ID is required"],
        },

        stripeProductId: {
            type: String,
        },

        plan: {
            type: String,
            enum: ["free", "pro", "enterprise"],
            required: [true, "Plan is required"],
            index: true,
        },

        status: {
            type: String,
            enum: [
                "active",
                "canceled",
                "past_due",
                "unpaid",
                "trialing",
                "incomplete",
                "incomplete_expired",
                "paused",
            ],
            default: "active",
            required: true,
            index: true,
        },

        // Pricing information
        amount: {
            type: Number,
            required: [true, "Subscription amount is required"],
            min: [0, "Amount cannot be negative"],
        },

        currency: {
            type: String,
            default: "usd",
            uppercase: true,
        },

        interval: {
            type: String,
            enum: ["day", "week", "month", "year"],
            default: "month",
        },

        intervalCount: {
            type: Number,
            default: 1,
            min: 1,
        },

        // Period information
        currentPeriodStart: {
            type: Date,
            required: true,
        },

        currentPeriodEnd: {
            type: Date,
            required: true,
        },

        // Trial information
        trialStart: {
            type: Date,
        },

        trialEnd: {
            type: Date,
        },

        // Cancellation information
        cancelAtPeriodEnd: {
            type: Boolean,
            default: false,
        },

        canceledAt: {
            type: Date,
        },

        cancelationReason: {
            type: String,
            maxlength: [500, "Cancellation reason cannot exceed 500 characters"],
        },

        endedAt: {
            type: Date,
        },

        // Credits allocation
        monthlyCredits: {
            type: Number,
            default: 0,
            min: [0, "Monthly credits cannot be negative"],
        },

        // Payment information
        latestInvoiceId: {
            type: String,
        },

        latestInvoiceStatus: {
            type: String,
        },

        // Auto-renewal
        autoRenew: {
            type: Boolean,
            default: true,
        },

        // Metadata
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                return ret;
            },
        },
    }
);

// Indexes
subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 }, { unique: true });
subscriptionSchema.index({ currentPeriodEnd: 1 });
subscriptionSchema.index({ plan: 1, status: 1 });

// Virtuals
subscriptionSchema.virtual("isActive").get(function () {
    return this.status === "active";
});

subscriptionSchema.virtual("isCanceled").get(function () {
    return this.status === "canceled" || this.cancelAtPeriodEnd;
});

subscriptionSchema.virtual("isInTrial").get(function () {
    return this.status === "trialing" && this.trialEnd && this.trialEnd > new Date();
});

subscriptionSchema.virtual("daysUntilRenewal").get(function () {
    if (!this.currentPeriodEnd) return 0;
    const diff = this.currentPeriodEnd - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

// Static methods
subscriptionSchema.statics = {
    // Find active subscription for user
    findActiveByUser: function (userId) {
        return this.findOne({
            user: userId,
            status: { $in: ["active", "trialing"] },
        });
    },

    // Find all active subscriptions
    findAllActive: function () {
        return this.find({
            status: { $in: ["active", "trialing"] },
        }).populate("user", "name email");
    },

    // Find subscriptions expiring soon
    findExpiringSoon: function (days = 7) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);

        return this.find({
            status: "active",
            currentPeriodEnd: {
                $gte: new Date(),
                $lte: futureDate,
            },
            cancelAtPeriodEnd: false,
        }).populate("user", "name email");
    },

    // Find by Stripe subscription ID
    findByStripeId: function (stripeSubscriptionId) {
        return this.findOne({ stripeSubscriptionId });
    },

    // Get subscription statistics
    getStats: async function () {
        return this.aggregate([
            {
                $group: {
                    _id: "$plan",
                    count: { $sum: 1 },
                    totalRevenue: { $sum: "$amount" },
                    activeCount: {
                        $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
                    },
                },
            },
        ]);
    },
};

// Instance methods
subscriptionSchema.methods = {
    // Cancel subscription
    cancel: async function (reason = "", immediately = false) {
        if (immediately) {
            this.status = "canceled";
            this.canceledAt = new Date();
            this.endedAt = new Date();
        } else {
            this.cancelAtPeriodEnd = true;
            this.canceledAt = new Date();
        }
        this.cancelationReason = reason;
        return this.save();
    },

    // Reactivate canceled subscription
    reactivate: async function () {
        if (this.cancelAtPeriodEnd) {
            this.cancelAtPeriodEnd = false;
            this.canceledAt = null;
            this.cancelationReason = null;
            this.status = "active";
            return this.save();
        }
        throw new Error("Subscription cannot be reactivated");
    },

    // Update subscription period
    updatePeriod: async function (periodStart, periodEnd) {
        this.currentPeriodStart = periodStart;
        this.currentPeriodEnd = periodEnd;
        return this.save();
    },

    // Update subscription status
    updateStatus: async function (newStatus) {
        this.status = newStatus;
        if (newStatus === "canceled") {
            this.endedAt = new Date();
        }
        return this.save();
    },
};

export default mongoose.model("Subscription", subscriptionSchema);
