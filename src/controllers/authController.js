import User from "../models/User.js";
import generateToken from "../utils/tokenUtils.js";
import crypto from "crypto";
import validator from "validator";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendWelcomeEmail, sendOtpEmail
} from "../utils/sendEmail.js"





const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000;

const checkRateLimit = (ip, email) => {
  const key = `${ip}-${email}`;
  const now = Date.now();
  const attempts = loginAttempts.get(key) || { count: 0, firstAttempt: now };

  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    if (now - attempts.firstAttempt < LOCK_TIME) return false;
    else loginAttempts.delete(key);
  }
  return true;
};
const incrementRateLimit = (ip, email) => {
  const key = `${ip}-${email}`;
  const now = Date.now();
  const attempts = loginAttempts.get(key) || { count: 0, firstAttempt: now };
  attempts.count++;
  loginAttempts.set(key, attempts);
  setTimeout(() => loginAttempts.delete(key), LOCK_TIME);
};
const resetRateLimit = (ip, email) => loginAttempts.delete(`${ip}-${email}`);


export const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const registerUser = async (req, res) => {
  try {
    const { name, email, password, country, language } = req.body;

    // Validation
    const validationErrors = [];
    if (!name || name.trim().length < 2)
      validationErrors.push("Name must be at least 2 characters.");
    if (!validator.isEmail(email))
      validationErrors.push("Invalid email address.");
    if (
      !password ||
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      validationErrors.push(
        "Password must include uppercase, lowercase, and number."
      );
    }
    if (validationErrors.length)
      return res.status(400).json({ success: false, errors: validationErrors });

    // Duplicate check
    let user = await User.findOne({ email });
    if (user) {
      return res.status(409).json({
        success: false,
        message: "User already exists."
      });
    }

    // Generate OTP
    const otp = generateOtp();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Create user with OTP fields
    user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password,
      country: country || "",
      language: language || "en",
      verified: false,
      otpCode: otp,
      otpExpires: new Date(otpExpires),
      freeGenerationsLeft: 3,
      isFreeTierExhausted: false,
    });

    console.log('📧 Attempting to send OTP email to:', user.email);

    // Send OTP email WITH ERROR HANDLING
    const emailResult = await sendOtpEmail(user.email, otp, user.name);

    if (!emailResult.success) {
      console.error('❌ Failed to send OTP email:', emailResult);

      // OPTION 1: Delete the user if email fails (recommended)
      await User.findByIdAndDelete(user._id);

      // OPTION 2: Keep user but mark email as failed (alternative)
      // user.emailSent = false;
      // await user.save();

      return res.status(500).json({
        success: false,
        message: "Failed to send verification email. Please try again.",
        error: emailResult.userMessage || "Email service error"
      });
    }

    console.log('✅ OTP email sent successfully!', {
      messageId: emailResult.messageId,
      email: user.email,
      otp: otp
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully. Please check your email for OTP.",
      requiresOtpVerification: true,
      otpSent: true,
    });
  } catch (error) {
    console.error("❌ Register Error:", error);

    // Handle specific errors
    let errorMessage = "Error during registration.";
    let statusCode = 500;

    if (error.name === 'ValidationError') {
      statusCode = 400;
      errorMessage = Object.values(error.errors).map(err => err.message).join(', ');
    } else if (error.code === 11000) { // MongoDB duplicate key
      statusCode = 409;
      errorMessage = "User already exists.";
    }

    return res.status(statusCode).json({
      success: false,
      message: errorMessage,
    });
  }
};


export const loginUser = async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip;


  try {
    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required."
      });
    }

    // Check rate limit
    if (!checkRateLimit(ip, email)) {
      return res
        .status(429)
        .json({ success: false, message: "Too many login attempts. Please try again later." });
    }

    if (!user) {
      incrementRateLimit(ip, email);
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    // Verify password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      await user.incrementLoginAttempts();
      incrementRateLimit(ip, email);
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
    }

    // Reset login attempts
    await user.resetLoginAttempts();
    resetRateLimit(ip, email);

    user.lastLogin = new Date();
    user.lastIP = ip;
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);


    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        verified: user.verified,
        role: user.role,
        credits: user.credits,
        freeGenerationsLeft: user.freeGenerationsLeft,
        isFreeTierExhausted: user.isFreeTierExhausted,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionEndsAt: user.subscriptionEndsAt
      },
    });
  } catch (error) {
    incrementRateLimit(ip, email);

    incrementRateLimit(ip, email);
    return res
      .status(500)
      .json({ success: false, message: "Error during login. Please try again later." });
  }
};


export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;


    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    // Find user - OTP fields are now included by default
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }


    // Check if OTP exists and is not expired
    if (!user.otpCode) {
      return res.status(400).json({
        success: false,
        message: "No OTP found. Please request a new OTP.",
      });
    }

    if (user.otpExpires < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new OTP.",
      });
    }


    if (user.otpCode !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // OTP is valid - mark user as verified and clear OTP
    user.verified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Generate new token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: "OTP verified successfully!",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        verified: true,
        credits: user.credits,
        freeGenerationsLeft: user.freeGenerationsLeft,
        isFreeTierExhausted: user.isFreeTierExhausted,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionEndsAt: user.subscriptionEndsAt
      },
      token,
    });

  } catch (error) {
    console.error("❌ OTP Verification Error:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying OTP",
    });
  }
};



export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email is required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found." });

    if (user.verified)
      return res
        .status(400)
        .json({ success: false, message: "User already verified." });

    const newOtp = generateOtp();
    user.otpCode = newOtp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    await sendOtpEmail(user.email, newOtp, user.name);

    return res.status(200).json({
      success: true,
      message: "New OTP sent successfully.",
    });
  } catch (error) {
    console.error("Resend OTP Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error resending OTP." });
  }
};




export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated.",
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        credits: user.credits,
        role: user.role,
        verified: user.verified,
        profilePic: user.profilePic,
        language: user.language,
        country: user.country,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        freeGenerationsLeft: user.freeGenerationsLeft,
        isFreeTierExhausted: user.isFreeTierExhausted,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionEndsAt: user.subscriptionEndsAt,
        bio: user.bio,
        location: user.location,
        website: user.website
      },
    });
  } catch (error) {
    console.error("Profile Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user profile.",
    });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const { name, language, country, profilePic, bio, location, website } = req.body;
    const userId = req.user.id;

    const updateData = {};

    if (profilePic) updateData.profilePic = profilePic;
    if (bio !== undefined) updateData.bio = bio;
    if (location !== undefined) updateData.location = location;
    if (website !== undefined) updateData.website = website;

    if (name) {
      updateData.name = validator.escape(name).trim();
    }
    if (language) {
      updateData.language = language;
    }
    if (country) {
      updateData.country = validator.escape(country).trim();
    }
    if (profilePic !== undefined) {
      updateData.profilePic = profilePic;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        credits: user.credits,
        role: user.role,
        verified: user.verified,
        profilePic: user.profilePic,
        language: user.language,
        country: user.country,
        lastLogin: user.lastLogin,
        freeGenerationsLeft: user.freeGenerationsLeft,
        isFreeTierExhausted: user.isFreeTierExhausted,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionEndsAt: user.subscriptionEndsAt
      },
    });
  } catch (error) {
    console.error("Update Profile Error:", error);

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating profile.",
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required.",
      });
    }

    // Validate new password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (newPassword.length < 8 || !passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be at least 8 characters and contain uppercase, lowercase, number and special character.",
      });
    }

    // Get user with password
    const user = await User.findById(userId).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Verify current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Send email notification
    try {
      await sendEmail({
        to: user.email,
        subject: "Password Changed Successfully",
        html: `
          <h2>Password Changed</h2>
          <p>Your password was successfully changed on ${new Date().toLocaleString()}.</p>
          <p>If you didn't make this change, please contact support immediately.</p>
        `,
      });
    } catch (emailError) {
      console.error("Password change notification email failed:", emailError);
    }

    res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("Change Password Error:", error);
    res.status(500).json({
      success: false,
      message: "Error changing password.",
    });
  }
};


export const logoutUser = async (req, res) => {
  try {

    res.status(200).json({
      success: true,
      message: "Logout successful.",
    });
  } catch (error) {
    console.error("Logout Error:", error);
    res.status(500).json({
      success: false,
      message: "Error during logout.",
    });
  }
};




// Rate limiting for forgot password
const forgotPasswordAttempts = new Map();
const MAX_FORGOT_PASSWORD_ATTEMPTS = 3;
const FORGOT_PASSWORD_LOCK_TIME = 30 * 60 * 1000; // 30 minutes

const checkForgotPasswordRateLimit = (ip, email) => {
  const key = `${ip}-${email}`;
  const now = Date.now();
  const attempts = forgotPasswordAttempts.get(key) || { count: 0, firstAttempt: now, lastAttempt: now };

  if (attempts.count >= MAX_FORGOT_PASSWORD_ATTEMPTS) {
    if (now - attempts.firstAttempt < FORGOT_PASSWORD_LOCK_TIME) {
      const timeLeft = Math.ceil((FORGOT_PASSWORD_LOCK_TIME - (now - attempts.firstAttempt)) / 60000);
      return { allowed: false, timeLeft };
    } else {
      forgotPasswordAttempts.delete(key);
    }
  }
  return { allowed: true };
};

const incrementForgotPasswordRateLimit = (ip, email) => {
  const key = `${ip}-${email}`;
  const now = Date.now();
  const attempts = forgotPasswordAttempts.get(key) || { count: 0, firstAttempt: now, lastAttempt: now };

  attempts.count++;
  attempts.lastAttempt = now;
  forgotPasswordAttempts.set(key, attempts);

  setTimeout(() => {
    const currentAttempts = forgotPasswordAttempts.get(key);
    if (currentAttempts && now - currentAttempts.firstAttempt >= FORGOT_PASSWORD_LOCK_TIME) {
      forgotPasswordAttempts.delete(key);
    }
  }, FORGOT_PASSWORD_LOCK_TIME);
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const ip = req.ip;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address.",
      });
    }

    // Check rate limiting
    const rateLimitCheck = checkForgotPasswordRateLimit(ip, email);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: `Too many password reset attempts. Please try again in ${rateLimitCheck.timeLeft} minutes.`,
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If an account exists with this email, a password reset OTP has been sent.",
      });
    }

    // Check if user is verified
    if (!user.verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email address before resetting your password.",
      });
    }

    // Generate OTP for password reset
    const resetOtp = generateOtp();
    user.otpCode = resetOtp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save({ validateBeforeSave: false });


    // Send password reset OTP email
    await sendOtpEmail(user.email, resetOtp, user.name, "password_reset");

    // Increment rate limit only for valid users
    incrementForgotPasswordRateLimit(ip, email);

    res.status(200).json({
      success: true,
      message: "If an account exists with this email, a password reset OTP has been sent.",
      requiresOtpVerification: true,
    });
  } catch (error) {
    console.error("❌ Forgot Password Error:", error);
    res.status(500).json({
      success: false,
      message: "Error processing password reset request."
    });
  }
};

export const verifyResetPasswordOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;


    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required.",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Check if OTP exists and is not expired
    if (!user.otpCode) {
      return res.status(400).json({
        success: false,
        message: "No OTP found. Please request a new password reset.",
      });
    }

    if (user.otpExpires < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new password reset.",
      });
    }

    // Verify OTP
    if (user.otpCode !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP.",
      });
    }

    // OTP is valid - generate reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });


    res.status(200).json({
      success: true,
      message: "OTP verified successfully. You can now reset your password.",
      resetToken,
    });

  } catch (error) {
    console.error("❌ Verify Reset Password OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying OTP.",
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and confirm password are required.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match.",
      });
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (password.length < 8 || !passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters and contain uppercase, lowercase, number and special character.",
      });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    }).select("+password");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token. Please request a new password reset.",
      });
    }

    const isSamePassword = await user.matchPassword(password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password cannot be the same as your current password.",
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    user.lastPasswordChange = new Date();

    await user.save();


    try {
      await sendPasswordChangedEmail(user.email, user.name, new Date(), req.ip);
    } catch (emailError) {
      console.error("Password change notification email failed:", emailError);
    }

    res.status(200).json({
      success: true,
      message: "Password reset successful. You can now login with your new password.",
    });
  } catch (error) {
    console.error("❌ Reset Password Error:", error);

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Password validation failed",
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error resetting password."
    });
  }
};

export const validateResetToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Reset token is required.",
      });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token.",
        valid: false,
      });
    }

    res.status(200).json({
      success: true,
      message: "Reset token is valid.",
      valid: true,
      email: user.email,
    });
  } catch (error) {
    console.error("❌ Validate Reset Token Error:", error);
    res.status(500).json({
      success: false,
      message: "Error validating reset token.",
      valid: false,
    });
  }
};

