import User from "../models/User.js";
import mongoose from "mongoose";



// @desc    Get user credit balance and history
// @route   GET /api/credits/balance
// @access  Private
export const getCreditBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("credits creditHistory name email")
      .sort({ "creditHistory.createdAt": -1 });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const formattedHistory = user.creditHistory.map(entry => ({
      id: entry._id,
      amount: entry.amount,
      type: entry.type,
      description: entry.description,
      balance: entry.balance,
      service: entry.service,
      reference: entry.reference,
      date: entry.createdAt,
    })).reverse(); 

    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        currentBalance: user.credits,
        history: formattedHistory,
        summary: {
          totalAdded: user.creditHistory
            .filter(entry => entry.amount > 0)
            .reduce((sum, entry) => sum + entry.amount, 0),
          totalUsed: Math.abs(user.creditHistory
            .filter(entry => entry.amount < 0)
            .reduce((sum, entry) => sum + entry.amount, 0)),
          transactionCount: user.creditHistory.length,
        },
      },
    });
  } catch (error) {
    console.error("Get Credit Balance Error:", error);
    
    res.status(500).json({
      success: false,
      message: "Error retrieving credit information.",
    });
  }
};

// @desc    Get credit balance for specific user (Admin only)
// @route   GET /api/credits/balance/:userId
// @access  Private/Admin
export const getUserCreditBalance = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format.",
      });
    }

    const user = await User.findById(userId)
      .select("credits creditHistory name email isActive role")
      .sort({ "creditHistory.createdAt": -1 });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const formattedHistory = user.creditHistory.map(entry => ({
      id: entry._id,
      amount: entry.amount,
      type: entry.type,
      description: entry.description,
      balance: entry.balance,
      service: entry.service,
      reference: entry.reference,
      adminId: entry.adminId,
      adminName: entry.adminName,
      date: entry.createdAt,
    })).reverse();

    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        isActive: user.isActive,
        currentBalance: user.credits,
        history: formattedHistory,
        summary: {
          totalAdded: user.creditHistory
            .filter(entry => entry.amount > 0)
            .reduce((sum, entry) => sum + entry.amount, 0),
          totalUsed: Math.abs(user.creditHistory
            .filter(entry => entry.amount < 0)
            .reduce((sum, entry) => sum + entry.amount, 0)),
          transactionCount: user.creditHistory.length,
        },
      },
    });
  } catch (error) {
    console.error("Get User Credit Balance Error:", error);
    
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error retrieving user credit information.",
    });
  }
};


export const addCredits = async (req, res) => {
  const { amount, description } = req.body;

  if (!amount || amount <= 0)
    return res.status(400).json({ success: false, message: "Invalid credit amount" });

  const user = await User.findById(req.user.id);
  user.credits += amount;
  user.creditHistory.push({ amount, type: "purchase", description });
  await user.save();

  res.status(200).json({ success: true, message: "Credits added", credits: user.credits });
};
