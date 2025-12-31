import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User is required"],
            index: true,
        },

        stripePaymentIntentId: {
            type: String,
            unique: true,
            sparse: true,
        },

        stripeSessionId: {
            type: String,
            unique: true,
            sparse: true,
        },

        type: {
            type: String,
            enum: ["credit_purchase", "subscription", "refund", "admin_grant"],
            required: [true, "Transaction type is required"],
            index: true,
        },

        amount: {
            type: Number,
            required: [true, "Amount is required"],
            min: [0, "Amount cannot be negative"],
        },

        currency: {
            type: String,
            default: "usd",
            uppercase: true,
        },

        creditsAmount: {
            type: Number,
            default: 0,
            min: [0, "Credits cannot be negative"],
        },

        status: {
            type: String,
            enum: ["pending", "processing", "completed", "failed", "approved", "rejected", "refunded"],
            default: "pending",
            required: true,
            index: true,
        },

        paymentMethod: {
            type: String,
            enum: ["card", "bank_transfer", "admin", "other"],
            default: "card",
        },

        description: {
            type: String,
            trim: true,
            maxlength: [500, "Description cannot exceed 500 characters"],
        },

        // Admin approval fields
        requiresApproval: {
            type: Boolean,
            default: true,
        },

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },

        approvedAt: {
            type: Date,
        },

        rejectedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },

        rejectedAt: {
            type: Date,
        },

        rejectionReason: {
            type: String,
            maxlength: [500, "Rejection reason cannot exceed 500 characters"],
        },

        // Stripe metadata
        stripeMetadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        // Error tracking
        errorMessage: {
            type: String,
        },

        errorCode: {
            type: String,
        },

        // Receipt information
        receiptUrl: {
            type: String,
        },

        invoiceUrl: {
            type: String,
        },

        // Package details for credit purchases
        packageDetails: {
            packageId: Number,
            packageName: String,
            creditsIncluded: Number,
            originalPrice: Number,
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

// Indexes for performance
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ stripePaymentIntentId: 1 }, { unique: true, sparse: true });
transactionSchema.index({ stripeSessionId: 1 }, { unique: true, sparse: true });

// Virtual for approval status
transactionSchema.virtual("isApproved").get(function () {
    return this.status === "approved";
});

transactionSchema.virtual("isPending").get(function () {
    return this.status === "pending" && this.requiresApproval;
});

// Static methods
transactionSchema.statics = {
    // Find all pending transactions for admin review
    findPendingApprovals: function () {
        return this.find({
            status: "pending",
            requiresApproval: true,
        })
            .populate("user", "name email")
            .sort({ createdAt: -1 });
    },

    // Find user transactions
    findByUser: function (userId, limit = 50) {
        return this.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(limit);
    },

    // Get transaction statistics
    getStats: async function (startDate, endDate) {
        const match = {};
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = new Date(startDate);
            if (endDate) match.createdAt.$lte = new Date(endDate);
        }

        return this.aggregate([
            { $match: match },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$amount" },
                    totalCredits: { $sum: "$creditsAmount" },
                },
            },
        ]);
    },

    // Find by Stripe payment intent
    findByPaymentIntent: function (paymentIntentId) {
        return this.findOne({ stripePaymentIntentId: paymentIntentId });
    },

    // Find by Stripe session
    findBySession: function (sessionId) {
        return this.findOne({ stripeSessionId: sessionId });
    },
};

// Instance methods
transactionSchema.methods = {
    // Approve transaction
    approve: async function (adminId) {
        this.status = "approved";
        this.approvedBy = adminId;
        this.approvedAt = new Date();
        return this.save();
    },

    // Reject transaction
    reject: async function (adminId, reason) {
        this.status = "rejected";
        this.rejectedBy = adminId;
        this.rejectedAt = new Date();
        this.rejectionReason = reason;
        return this.save();
    },

    // Mark as completed
    complete: async function () {
        this.status = "completed";
        return this.save();
    },

    // Mark as failed
    fail: async function (errorMessage, errorCode = null) {
        this.status = "failed";
        this.errorMessage = errorMessage;
        if (errorCode) this.errorCode = errorCode;
        return this.save();
    },
};

export default mongoose.model("Transaction", transactionSchema);
