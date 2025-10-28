import mongoose from "mongoose";
import bcrypt from "bcryptjs";


const userSchema = new mongoose.Schema(
    {

        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            minlength: 2,
            maxlength: 60,
        },

        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [
                /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/,
                "Please enter a valid email address",
            ],
        },

        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: 6,
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

        creditHistory: [
            {
                amount: { type: Number, required: true },
                type: { type: String, enum: ["purchase", "refund", "generation"], required: true },
                description: { type: String },
                createdAt: { type: Date, default: Date.now },
            },
        ],

        profilePic: {
            type: String,
            default: "",
        },

        language: {
            type: String,
            enum: ["en", "fr", "es", "ar", "de"],
            default: "en",
        },

        country: {
            type: String,
            default: "",
        },
        lastLogin: { type: Date },
        lastIP: { type: String },
        verified: { type: Boolean, default: false },
        verificationToken: { type: String },
        resetPasswordToken: { type: String },
        resetPasswordExpire: { type: Date },
    },
    { timestamps: true }
);

userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

userSchema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
        delete ret._id;
        delete ret.password;
        delete ret.verificationToken;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpire;
    },
});

userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

export default mongoose.model("User", userSchema);
