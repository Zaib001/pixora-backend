import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [60, "Name cannot exceed 60 characters"],
      match: [/^[a-zA-Z\s]*$/, "Name can only contain letters and spaces"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (email) {
          return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email);
        },
        message: "Please enter a valid email address",
      },
    },

    bio: {
      type: String,
      maxlength: [500, "Bio cannot exceed 500 characters"],
      default: "",
    },

    location: {
      type: String,
      maxlength: [100, "Location cannot exceed 100 characters"],
      default: "",
    },

    website: {
      type: String,
      maxlength: [100, "Website cannot exceed 100 characters"],
      default: "",
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      validate: {
        validator: function (password) {
          return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(
            password
          );
        },
        message:
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      },
      select: false,
    },

    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      default: "user",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    credits: {
      type: Number,
      default: 0,
      min: [0, "Credits cannot be negative"],
    },

    freeGenerationsLeft: {
      type: Number,
      default: 3,
    },

    isFreeTierExhausted: {
      type: Boolean,
      default: false,
    },

    creditHistory: [
      {
        amount: { type: Number, required: true },
        type: {
          type: String,
          enum: ["purchase", "refund", "generation", "usage"],
          required: true,
        },
        description: { type: String },
        balance: { type: Number, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    profilePic: {
      type: String,
      default: "",
      validate: {
        validator: function (url) {
          if (!url) return true;
          return /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/.test(url);
        },
        message: "Please provide a valid URL for profile picture",
      },
    },

    language: {
      type: String,
      enum: ["en", "fr", "es", "ar", "de", "zh", "ja"],
      default: "en",
    },

    country: {
      type: String,
      default: "",
      maxlength: 60,
    },

    lastLogin: {
      type: Date,
      default: null
    },

    lastIP: {
      type: String,
      default: null
    },

    verified: {
      type: Boolean,
      default: false
    },

    verificationToken: {
      type: String,
      select: false
    },

    verificationExpires: {
      type: Date,
      select: false
    },

    // OTP FIELDS - REMOVED select: false
    otpCode: {
      type: String
    },

    otpExpires: {
      type: Date
    },

    resetPasswordToken: {
      type: String,
      select: false
    },

    resetPasswordExpire: {
      type: Date,
      select: false
    },

    loginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },

    lockUntil: {
      type: Date,
      select: false,
    },

    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },

    twoFactorSecret: {
      type: String,
      select: false,
    },

    // Stripe Integration
    stripeCustomerId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    // Subscription fields
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
    },

    subscriptionPlan: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
    },

    subscriptionStatus: {
      type: String,
      enum: ["active", "inactive", "canceled", "past_due"],
      default: "inactive",
    },

    subscriptionEndsAt: {
      type: Date,
    },

    // Free Tier Fields
    freeGenerationsLeft: {
      type: Number,
      default: 3, // Give 3 free generations by default
    },

    isFreeTierExhausted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.password;
        delete ret.verificationToken;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpire;
        delete ret.twoFactorSecret;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        // Also remove OTP fields from JSON output for security
        delete ret.otpCode;
        delete ret.otpExpires;
        return ret;
      },
    },
  }
);

// Virtual for account lock status
userSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Virtual for OTP validity check
userSchema.virtual("isOtpValid").get(function () {
  if (!this.otpCode || !this.otpExpires) return false;
  return this.otpExpires > Date.now();
});

// Password hashing middleware
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update timestamps on save
userSchema.pre("save", function (next) {
  if (this.isModified()) {
    this.updatedAt = Date.now();
  }
  next();
});

// Methods
userSchema.methods = {
  // Compare password
  matchPassword: async function (enteredPassword) {
    if (!enteredPassword) return false;
    return await bcrypt.compare(enteredPassword, this.password);
  },

  // Generate verification token
  generateVerificationToken: function () {
    const token = crypto.randomBytes(32).toString("hex");
    this.verificationToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");
    this.verificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    return token;
  },

  // Generate OTP
  generateOtp: function () {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    this.otpCode = otp;
    this.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    return otp;
  },

  // Verify OTP
  verifyOtp: function (enteredOtp) {
    if (!this.otpCode || !this.otpExpires) {
      return false;
    }

    if (this.otpExpires < Date.now()) {
      this.otpCode = undefined;
      this.otpExpires = undefined;
      return false;
    }

    const isValid = this.otpCode === enteredOtp;

    if (isValid) {
      this.verified = true;
      this.otpCode = undefined;
      this.otpExpires = undefined;
    }

    return isValid;
  },

  // Generate password reset token
  generatePasswordResetToken: function () {
    const token = crypto.randomBytes(32).toString("hex");
    this.resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");
    this.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 minutes
    return token;
  },

  // Increment login attempts
  incrementLoginAttempts: async function () {
    if (this.lockUntil && this.lockUntil < Date.now()) {
      return this.updateOne({
        $set: { loginAttempts: 1 },
        $unset: { lockUntil: 1 },
      });
    }

    const updates = { $inc: { loginAttempts: 1 } };
    if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
      updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
    }
    return this.updateOne(updates);
  },

  // Reset login attempts on successful login
  resetLoginAttempts: function () {
    return this.updateOne({
      $set: { loginAttempts: 0 },
      $unset: { lockUntil: 1 },
    });
  },

  // Add credits with history
  addCredits: function (amount, type = "purchase", description = "") {
    this.credits += amount;
    this.creditHistory.push({
      amount,
      type,
      description,
      balance: this.credits,
    });
    return this.save();
  },

  // Use credits with validation
  useCredits: function (amount, description = "") {
    if (this.credits < amount) {
      throw new Error("Insufficient credits");
    }
    this.credits -= amount;
    this.creditHistory.push({
      amount: -amount,
      type: "usage",
      description,
      balance: this.credits,
    });
    return this.save();
  },

  // Check if user has free generations available
  checkFreeTierAvailability: function () {
    return this.freeGenerationsLeft > 0;
  },

  // Use a free generation
  useFreeGeneration: async function (description = "Free tier generation") {
    if (this.freeGenerationsLeft <= 0) {
      throw new Error("No free generations remaining");
    }

    this.freeGenerationsLeft -= 1;

    // Mark as exhausted if no more free generations
    if (this.freeGenerationsLeft === 0) {
      this.isFreeTierExhausted = true;
    }

    // Track in credit history for transparency
    this.creditHistory.push({
      amount: 0,
      type: "usage",
      description: `${description} (Free Tier - ${3 - this.freeGenerationsLeft}/3)`,
      balance: this.credits,
    });

    return this.save();
  },

  // Restore free generation on failure
  restoreFreeGeneration: async function (description = "Generation failed - restored") {
    if (this.freeGenerationsLeft < 3) {
      this.freeGenerationsLeft += 1;
      this.isFreeTierExhausted = false;

      this.creditHistory.push({
        amount: 0,
        type: "refund",
        description,
        balance: this.credits,
      });

      return this.save();
    }
    return this;
  },
};

// Static methods
userSchema.statics = {
  // Find by email (including password for auth)
  findByEmail: function (email) {
    return this.findOne({ email }).select("+password +loginAttempts +lockUntil");
  },

  // Find user with OTP fields (for OTP verification)
  findByEmailWithOtp: function (email) {
    return this.findOne({ email });
  },

  // Find active users only
  findActive: function () {
    return this.find({ isActive: true });
  },

  // Find user by verification token
  findByVerificationToken: function (token) {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    return this.findOne({
      verificationToken: hashedToken,
      verificationExpires: { $gt: Date.now() },
    });
  },

  // Find user by reset token
  findByResetToken: function (token) {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    return this.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    }).select("+resetPasswordToken +resetPasswordExpire");
  },
};

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ "creditHistory.createdAt": -1 });
userSchema.index({ verificationToken: 1 });
userSchema.index({ resetPasswordToken: 1 });
userSchema.index({ otpCode: 1 });
userSchema.index({ otpExpires: 1 });

export default mongoose.model("User", userSchema);
