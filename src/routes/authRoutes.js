import express from "express";
import {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  logoutUser,
  verifyOtp,
  resendOtp,
  verifyResetPasswordOtp,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// ===============================
// 🔓 Public Routes
// ===============================
router.post("/register", registerUser);
router.post("/login", loginUser);

// OTP-based verification
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);

// Password reset
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetPasswordOtp);
router.post("/reset-password/:token", resetPassword);

// ===============================
// 🔒 Private Routes
// ===============================
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, updateUserProfile);
router.put("/change-password", protect, changePassword);
router.post("/logout", protect, logoutUser);

router.post('/test-otp-save', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.otpCode = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const updatedUser = await User.findOne({ email });
    
    res.json({
      success: true,
      before: { otpCode: user.otpCode, otpExpires: user.otpExpires },
      after: { otpCode: updatedUser.otpCode, otpExpires: updatedUser.otpExpires }
    });
  } catch (error) {
    console.error('Test OTP save error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
router.get('/check-user/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        verified: user.verified,
        otpCode: user.otpCode,
        otpExpires: user.otpExpires,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Check user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking user'
    });
  }
});

export default router;
