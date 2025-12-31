import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import mongoose from "mongoose";

// @desc    Get user's transaction history
// @route   GET /api/transactions
// @access  Private
export const getUserTransactions = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 50, page = 1, type, status } = req.query;

        const query = { user: userId };
        if (type) query.type = type;
        if (status) query.status = status;

        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await Transaction.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                transactions,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                total: count,
            },
        });
    } catch (error) {
        console.error("Get User Transactions Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve transactions.",
            error: error.message,
        });
    }
};

// @desc    Get all transactions (Admin)
// @route   GET /api/admin/transactions
// @access  Private/Admin
export const getAllTransactions = async (req, res) => {
    try {
        const {
            limit = 50,
            page = 1,
            type,
            status,
            requiresApproval,
            userId,
            startDate,
            endDate,
        } = req.query;

        const query = {};
        if (type) query.type = type;
        if (status) query.status = status;
        if (requiresApproval !== undefined) {
            query.requiresApproval = requiresApproval === "true";
            if (query.requiresApproval) {
                query.status = "pending";
            }
        }
        if (userId) query.user = userId;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const transactions = await Transaction.find(query)
            .populate("user", "name email")
            .populate("approvedBy", "name email")
            .populate("rejectedBy", "name email")
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await Transaction.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                transactions,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                total: count,
            },
        });
    } catch (error) {
        console.error("Get All Transactions Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve transactions.",
            error: error.message,
        });
    }
};

// @desc    Get pending transactions for approval (Admin)
// @route   GET /api/admin/transactions/pending
// @access  Private/Admin
export const getPendingTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.findPendingApprovals();

        res.status(200).json({
            success: true,
            data: {
                transactions,
                count: transactions.length,
            },
        });
    } catch (error) {
        console.error("Get Pending Transactions Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve pending transactions.",
            error: error.message,
        });
    }
};

// @desc    Approve transaction and add credits (Admin)
// @route   PATCH /api/admin/transactions/:id/approve
// @access  Private/Admin
export const approveTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid transaction ID.",
            });
        }

        const transaction = await Transaction.findById(id).populate("user", "name email credits");

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found.",
            });
        }

        if (transaction.status !== "pending" && transaction.status !== "completed") {
            return res.status(400).json({
                success: false,
                message: `Transaction cannot be approved. Current status: ${transaction.status}`,
            });
        }

        if (!transaction.requiresApproval) {
            return res.status(400).json({
                success: false,
                message: "Transaction does not require approval.",
            });
        }

        // Approve transaction
        await transaction.approve(adminId);

        // Add credits to user
        if (transaction.creditsAmount > 0) {
            const user = await User.findById(transaction.user._id || transaction.user);
            if (user) {
                await user.addCredits(
                    transaction.creditsAmount,
                    "purchase",
                    transaction.description || `Admin approved purchase - ${transaction.creditsAmount} credits`
                );
            }
        }

        // Reload transaction with populated fields
        const updatedTransaction = await Transaction.findById(id)
            .populate("user", "name email credits")
            .populate("approvedBy", "name email");

        res.status(200).json({
            success: true,
            data: {
                transaction: updatedTransaction,
            },
            message: `Transaction approved. ${transaction.creditsAmount} credits added to user account.`,
        });
    } catch (error) {
        console.error("Approve Transaction Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to approve transaction.",
            error: error.message,
        });
    }
};

// @desc    Reject transaction (Admin)
// @route   PATCH /api/admin/transactions/:id/reject
// @access  Private/Admin
export const rejectTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid transaction ID.",
            });
        }

        const transaction = await Transaction.findById(id);

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found.",
            });
        }

        if (transaction.status !== "pending" && transaction.status !== "completed") {
            return res.status(400).json({
                success: false,
                message: `Transaction cannot be rejected. Current status: ${transaction.status}`,
            });
        }

        // Reject transaction
        await transaction.reject(adminId, reason || "Rejected by admin");

        // Reload transaction with populated fields
        const updatedTransaction = await Transaction.findById(id)
            .populate("user", "name email")
            .populate("rejectedBy", "name email");

        res.status(200).json({
            success: true,
            data: {
                transaction: updatedTransaction,
            },
            message: "Transaction rejected successfully.",
        });
    } catch (error) {
        console.error("Reject Transaction Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to reject transaction.",
            error: error.message,
        });
    }
};

// @desc    Get transaction statistics (Admin)
// @route   GET /api/admin/transactions/stats
// @access  Private/Admin
export const getTransactionStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const stats = await Transaction.getStats(startDate, endDate);

        const totalTransactions = await Transaction.countDocuments();
        const pendingApprovals = await Transaction.countDocuments({
            status: "pending",
            requiresApproval: true,
        });

        // Calculate total revenue
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

        res.status(200).json({
            success: true,
            data: {
                totalTransactions,
                pendingApprovals,
                totalRevenue: totalRevenue.toFixed(2),
                totalCreditsIssued,
                statusBreakdown: stats,
            },
        });
    } catch (error) {
        console.error("Get Transaction Stats Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve statistics.",
            error: error.message,
        });
    }
};

// @desc    Get single transaction details (Admin)
// @route   GET /api/admin/transactions/:id
// @access  Private/Admin
export const getTransactionById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid transaction ID.",
            });
        }

        const transaction = await Transaction.findById(id)
            .populate("user", "name email credits")
            .populate("approvedBy", "name email")
            .populate("rejectedBy", "name email");

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found.",
            });
        }

        res.status(200).json({
            success: true,
            data: {
                transaction,
            },
        });
    } catch (error) {
        console.error("Get Transaction Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve transaction.",
            error: error.message,
        });
    }
};
