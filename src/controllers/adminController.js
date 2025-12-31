import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Subscription from "../models/Subscription.js";
import Content from "../models/Content.js";
import mongoose from "mongoose";
import stripe from "../config/stripeConfig.js";

// @desc    Get all users with pagination, search, and filters
// @route   GET /api/admin/users
// @access  Private/Admin
export const getAllUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = "",
            role,
            subscriptionPlan,
            isActive,
            sortBy = "createdAt",
            sortOrder = "desc",
        } = req.query;

        // Build query
        const query = {};

        // Search by name or email
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }

        // Filter by role
        if (role) query.role = role;

        // Filter by subscription plan
        if (subscriptionPlan) query.subscriptionPlan = subscriptionPlan;

        // Filter by active status
        if (isActive !== undefined) query.isActive = isActive === "true";

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

        const users = await User.find(query)
            .select("-password -verificationToken -resetPasswordToken -twoFactorSecret")
            .sort(sortOptions)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const count = await User.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                users,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                total: count,
            },
        });
    } catch (error) {
        console.error("Get All Users Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve users.",
            error: error.message,
        });
    }
};

// @desc    Get user by ID with detailed information
// @route   GET /api/admin/users/:id
// @access  Private/Admin
export const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID.",
            });
        }

        const user = await User.findById(id)
            .select("-password -verificationToken -resetPasswordToken -twoFactorSecret")
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        // Get user's subscription
        const subscription = await Subscription.findOne({ user: id }).lean();

        // Get user's recent transactions
        const transactions = await Transaction.find({ user: id })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        // Calculate total spent
        const completedTransactions = await Transaction.find({
            user: id,
            status: { $in: ["completed", "approved"] },
        });

        const totalSpent = completedTransactions.reduce(
            (sum, t) => sum + t.amount,
            0
        );

        res.status(200).json({
            success: true,
            data: {
                user,
                subscription,
                recentTransactions: transactions,
                totalSpent: totalSpent.toFixed(2),
            },
        });
    } catch (error) {
        console.error("Get User By ID Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve user details.",
            error: error.message,
        });
    }
};

// @desc    Update user role
// @route   PATCH /api/admin/users/:id/role
// @access  Private/SuperAdmin
export const updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID.",
            });
        }

        if (!["user", "admin", "superadmin"].includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid role. Must be 'user', 'admin', or 'superadmin'.",
            });
        }

        const user = await User.findByIdAndUpdate(
            id,
            { role },
            { new: true, runValidators: true }
        ).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        res.status(200).json({
            success: true,
            data: { user },
            message: `User role updated to ${role}.`,
        });
    } catch (error) {
        console.error("Update User Role Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update user role.",
            error: error.message,
        });
    }
};

// @desc    Toggle user active status (suspend/activate)
// @route   PATCH /api/admin/users/:id/status
// @access  Private/Admin
export const toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID.",
            });
        }

        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "isActive must be a boolean value.",
            });
        }

        const user = await User.findByIdAndUpdate(
            id,
            { isActive },
            { new: true, runValidators: true }
        ).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        res.status(200).json({
            success: true,
            data: { user },
            message: `User ${isActive ? "activated" : "suspended"} successfully.`,
        });
    } catch (error) {
        console.error("Toggle User Status Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update user status.",
            error: error.message,
        });
    }
};

// @desc    Get user statistics
// @route   GET /api/admin/stats/users
// @access  Private/Admin
export const getUserStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ isActive: true });
        const inactiveUsers = await User.countDocuments({ isActive: false });

        // New users in last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const newUsers = await User.countDocuments({
            createdAt: { $gte: thirtyDaysAgo },
        });

        // Users by role
        const usersByRole = await User.aggregate([
            {
                $group: {
                    _id: "$role",
                    count: { $sum: 1 },
                },
            },
        ]);

        // Users by subscription plan
        const usersByPlan = await User.aggregate([
            {
                $group: {
                    _id: "$subscriptionPlan",
                    count: { $sum: 1 },
                },
            },
        ]);

        // Verified vs unverified
        const verifiedUsers = await User.countDocuments({ verified: true });
        const unverifiedUsers = await User.countDocuments({ verified: false });

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                activeUsers,
                inactiveUsers,
                newUsers,
                verifiedUsers,
                unverifiedUsers,
                usersByRole,
                usersByPlan,
            },
        });
    } catch (error) {
        console.error("Get User Stats Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve user statistics.",
            error: error.message,
        });
    }
};

// @desc    Get comprehensive dashboard statistics
// @route   GET /api/admin/stats/dashboard
// @access  Private/Admin
export const getDashboardStats = async (req, res) => {
    try {
        // User stats
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ isActive: true });

        // Revenue stats
        const completedTransactions = await Transaction.find({
            status: { $in: ["completed", "approved"] },
        });

        const totalRevenue = completedTransactions.reduce(
            (sum, t) => sum + t.amount,
            0
        );

        const totalCreditsIssued = completedTransactions.reduce(
            (sum, t) => sum + t.creditsAmount,
            0
        );

        // Revenue this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const monthlyTransactions = await Transaction.find({
            status: { $in: ["completed", "approved"] },
            createdAt: { $gte: startOfMonth },
        });

        const monthlyRevenue = monthlyTransactions.reduce(
            (sum, t) => sum + t.amount,
            0
        );

        // Active subscriptions
        const activeSubscriptions = await Subscription.countDocuments({
            status: { $in: ["active", "trialing"] },
        });

        // Pending transactions
        const pendingTransactions = await Transaction.countDocuments({
            status: "pending",
            requiresApproval: true,
        });

        // Recent activity - last 10 transactions
        const recentTransactions = await Transaction.find()
            .populate("user", "name email")
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        // New users today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const newUsersToday = await User.countDocuments({
            createdAt: { $gte: startOfDay },
        });

        res.status(200).json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    newToday: newUsersToday,
                },
                revenue: {
                    total: totalRevenue.toFixed(2),
                    monthly: monthlyRevenue.toFixed(2),
                },
                credits: {
                    totalIssued: totalCreditsIssued,
                },
                subscriptions: {
                    active: activeSubscriptions,
                },
                transactions: {
                    pending: pendingTransactions,
                },
                recentActivity: recentTransactions,
            },
        });
    } catch (error) {
        console.error("Get Dashboard Stats Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve dashboard statistics.",
            error: error.message,
        });
    }
};

// @desc    Get revenue analytics with date range
// @route   GET /api/admin/analytics/revenue
// @access  Private/Admin
export const getRevenueAnalytics = async (req, res) => {
    try {
        const { startDate, endDate, groupBy = "day" } = req.query;

        const match = { status: { $in: ["completed", "approved"] } };

        // Date range filter
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = new Date(startDate);
            if (endDate) match.createdAt.$lte = new Date(endDate);
        }

        // Group by period
        let dateFormat;
        switch (groupBy) {
            case "hour":
                dateFormat = { $dateToString: { format: "%Y-%m-%d %H:00", date: "$createdAt" } };
                break;
            case "day":
                dateFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
                break;
            case "week":
                dateFormat = { $dateToString: { format: "%Y-W%V", date: "$createdAt" } };
                break;
            case "month":
                dateFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
                break;
            default:
                dateFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
        }

        const revenueByPeriod = await Transaction.aggregate([
            { $match: match },
            {
                $group: {
                    _id: dateFormat,
                    revenue: { $sum: "$amount" },
                    count: { $sum: 1 },
                    credits: { $sum: "$creditsAmount" },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // Revenue by type
        const revenueByType = await Transaction.aggregate([
            { $match: match },
            {
                $group: {
                    _id: "$type",
                    revenue: { $sum: "$amount" },
                    count: { $sum: 1 },
                },
            },
        ]);

        // Revenue by subscription plan
        const revenueByPlan = await Subscription.aggregate([
            { $match: { status: { $in: ["active", "trialing"] } } },
            {
                $group: {
                    _id: "$plan",
                    revenue: { $sum: "$amount" },
                    count: { $sum: 1 },
                },
            },
        ]);

        res.status(200).json({
            success: true,
            data: {
                revenueByPeriod,
                revenueByType,
                revenueByPlan,
            },
        });
    } catch (error) {
        console.error("Get Revenue Analytics Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve revenue analytics.",
            error: error.message,
        });
    }
};

// @desc    Get credit usage analytics
// @route   GET /api/admin/analytics/credits
// @access  Private/Admin
export const getCreditAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Total credits in system
        const users = await User.find().select("credits").lean();
        const totalCreditsInSystem = users.reduce((sum, u) => sum + u.credits, 0);

        // Credits issued (from transactions)
        const match = { status: { $in: ["completed", "approved"] } };
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = new Date(startDate);
            if (endDate) match.createdAt.$lte = new Date(endDate);
        }

        const creditsIssued = await Transaction.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$creditsAmount" },
                },
            },
        ]);

        // Average credits per user
        const avgCreditsPerUser = totalCreditsInSystem / users.length;

        // Users by credit range
        const usersByCreditRange = await User.aggregate([
            {
                $bucket: {
                    groupBy: "$credits",
                    boundaries: [0, 10, 50, 100, 500, 1000, 10000],
                    default: "10000+",
                    output: {
                        count: { $sum: 1 },
                        users: { $push: { name: "$name", credits: "$credits" } },
                    },
                },
            },
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalCreditsInSystem,
                creditsIssued: creditsIssued[0]?.total || 0,
                avgCreditsPerUser: avgCreditsPerUser.toFixed(2),
                usersByCreditRange,
            },
        });
    } catch (error) {
        console.error("Get Credit Analytics Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve credit analytics.",
            error: error.message,
        });
    }
};

// @desc    Get activity logs (recent transactions and user activities)
// @route   GET /api/admin/activity-logs
// @access  Private/Admin
export const getActivityLogs = async (req, res) => {
    try {
        const { limit = 50, page = 1, type } = req.query;

        const query = {};
        if (type) query.type = type;

        const activities = await Transaction.find(query)
            .populate("user", "name email")
            .populate("approvedBy", "name email")
            .populate("rejectedBy", "name email")
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const count = await Transaction.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                activities,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                total: count,
            },
        });
    } catch (error) {
        console.error("Get Activity Logs Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve activity logs.",
            error: error.message,
        });
    }
};
// @desc    Refund a transaction and update user credits
// @route   POST /api/admin/transactions/:id/refund
// @access  Private/Admin
export const refundTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user._id;

        const transaction = await Transaction.findById(id).populate("user");

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found.",
            });
        }

        if (transaction.status === "refunded") {
            return res.status(400).json({
                success: false,
                message: "Transaction is already refunded.",
            });
        }

        // Verify it's a refundable transaction type
        if (!["credit_purchase", "failed_generation"].includes(transaction.type)) {
            return res.status(400).json({
                success: false,
                message: "This transaction type cannot be refunded automatically.",
            });
        }

        // 1. Handle Stripe Refund (if it was a purchase)
        if (transaction.type === "credit_purchase" && transaction.stripePaymentIntentId) {
            try {
                // Determine if we should refund full amount
                // For now, always full refund. Partial refunds could be added later.
                const refund = await stripe.refunds.create({
                    payment_intent: transaction.stripePaymentIntentId,
                    reason: 'requested_by_customer', // Default stripe reason enum
                    metadata: {
                        transactionId: transaction._id.toString(),
                        adminId: adminId.toString(),
                        internalReason: reason || "Admin initiated refund"
                    }
                });

                transaction.stripeMetadata = { ...transaction.stripeMetadata, refundId: refund.id };
            } catch (stripeError) {
                console.error("Stripe Refund Error:", stripeError);
                return res.status(400).json({
                    success: false,
                    message: `Stripe refund failed: ${stripeError.message}`,
                });
            }
        }

        // 2. Restore/Deduct Credits Logic
        if (transaction.creditsAmount > 0 && transaction.user) {
            const user = transaction.user;
            if (transaction.type === "credit_purchase") {
                // Money back = Remove credits
                user.credits = Math.max(0, user.credits - transaction.creditsAmount);
                await user.save();
            } else if (transaction.type === "failed_generation") {
                // Restore credits specifically for failed generations if manual refund is needed
                // Usually failed gens Auto-refund, but this is a manual override
                user.credits += transaction.creditsAmount;
                await user.save();
            }
        }

        // 3. Update Status
        transaction.status = "refunded";
        transaction.refundedAt = Date.now();
        transaction.refundedBy = adminId;
        transaction.refundReason = reason;

        await transaction.save();

        res.status(200).json({
            success: true,
            data: { transaction },
            message: "Transaction refunded successfully.",
        });
    } catch (error) {
        console.error("Refund Transaction Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to refund transaction.",
            error: error.message,
        });
    }
};

// @desc    Get all content (community feed management)
// @route   GET /api/admin/content
// @access  Private/Admin
export const getAllContent = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = "",
            type,
            status,
            isPublic,
            sortBy = "createdAt",
            sortOrder = "desc",
        } = req.query;

        const query = {};

        // Search by prompt or user name (requires lookup if searching by user name, but prompt is easier for now)
        if (search) {
            query.prompt = { $regex: search, $options: "i" };
        }

        if (type) query.type = type;
        if (status) query.status = status;
        if (isPublic !== undefined) query.isPublic = isPublic === "true";

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

        const content = await Content.find(query)
            .populate("user", "name email")
            .sort(sortOptions)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const count = await Content.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                content,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                total: count,
            },
        });
    } catch (error) {
        console.error("Get All Content Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve content.",
            error: error.message,
        });
    }
};

// @desc    Delete content (admin moderation)
// @route   DELETE /api/admin/content/:id
// @access  Private/Admin
export const deleteContent = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid content ID.",
            });
        }

        const content = await Content.findByIdAndDelete(id);

        if (!content) {
            return res.status(404).json({
                success: false,
                message: "Content not found.",
            });
        }

        res.status(200).json({
            success: true,
            message: "Content deleted successfully.",
        });
    } catch (error) {
        console.error("Delete Content Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete content.",
            error: error.message,
        });
    }
};
