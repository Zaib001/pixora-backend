import mongoose from "mongoose";

const contentSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        type: {
            type: String,
            enum: ["video", "image", "animation", "audio"],
            required: true,
        },
        style: {
            type: String,
            default: "realistic"
        },
        url: {
            type: String,
            required: true,
        },
        thumbnailUrl: {
            type: String,
        },
        prompt: {
            type: String,
            required: true,
        },
        modelDetails: {
            provider: { type: String, default: "comet" },
            modelId: String,
        },
        isPublic: {
            type: Boolean,
            default: false, // Default false, but Free Tier force updates to true
        },
        isWatermarked: {
            type: Boolean,
            default: false,
        },
        usageCost: {
            type: Number,
            default: 0,
        },
        metadata: {
            duration: Number,
            width: Number,
            height: Number,
            format: String,
        },
        status: {
            type: String,
            enum: ["processing", "completed", "failed"],
            default: "processing",
        },
    },
    {
        timestamps: true,
    }
);

// Indexes for faster querying of community page
contentSchema.index({ isPublic: 1, createdAt: -1 });
contentSchema.index({ user: 1, createdAt: -1 });

const Content = mongoose.model("Content", contentSchema);

export default Content;
