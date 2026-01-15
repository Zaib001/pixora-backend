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
            required: false,
        },
        thumbnailUrl: {
            type: String,
        },
        remoteUrl: {
            type: String,
        },
        generationId: {
            type: String,
            index: true
        },
        prompt: {
            type: String,
            required: true,
        },
        modelDetails: {
            provider: { type: String, default: "comet" },
            modelId: String,
        },
        status: {
            type: String,
            enum: ["pending", "processing", "completed", "failed"],
            default: "pending",
        },
        progress: {
            type: Number,
            default: 0,
        },
        error: {
            type: String,
        },
        isPublic: {
            type: Boolean,
            default: false,
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
            type: mongoose.Schema.Types.Mixed,
            default: {}
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
