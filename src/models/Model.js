import mongoose from "mongoose";

const modelSchema = new mongoose.Schema(
    {
        modelId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        provider: {
            type: String,
            required: true,
            enum: ["competapi", "openai", "custom"],
            default: "competapi",
        },
        type: {
            type: String,
            required: true,
            enum: ["video", "image"],
        },
        status: {
            type: String,
            enum: ["active", "beta", "inactive", "deprecated"],
            default: "active",
        },
        // Pricing Configuration
        pricing: {
            costPerSecond: {
                type: Number,
                default: 0,
            },
            costPerImage: {
                type: Number,
                default: 0,
            },
        },
        // Technical Specifications
        specifications: {
            supportedAspectRatios: {
                type: [String],
                default: ["16:9", "9:16", "1:1"],
            },
            minDuration: {
                type: Number,
                default: 3,
            },
            maxDuration: {
                type: Number,
                default: 30,
            },
            defaultDuration: {
                type: Number,
                default: 5,
            },
            estimatedGenerationTime: {
                type: Number, // in seconds
                default: 60,
            },
            outputFormat: {
                type: String,
                default: "mp4", // or "png" for images
            },
        },
        // API Configuration
        apiConfig: {
            endpoint: String,
            method: {
                type: String,
                default: "POST",
            },
            headers: mongoose.Schema.Types.Mixed,
            requestFormat: mongoose.Schema.Types.Mixed,
        },
        // Features
        features: {
            supportsPromptEnhancement: {
                type: Boolean,
                default: false,
            },
            supportsNegativePrompts: {
                type: Boolean,
                default: false,
            },
            supportsStylePresets: {
                type: Boolean,
                default: true,
            },
        },
        // Stats
        stats: {
            totalGenerations: {
                type: Number,
                default: 0,
            },
            successfulGenerations: {
                type: Number,
                default: 0,
            },
            failedGenerations: {
                type: Number,
                default: 0,
            },
            averageGenerationTime: {
                type: Number,
                default: 0,
            },
        },

        // Metadata
        description: String,
        tags: [String],
        supportedContexts: {
            type: [String],
            enum: ["text-to-video", "image-to-video", "text-to-image", "image-to-image", "video-to-video"],
            default: []
        },
        isPopular: {
            type: Boolean,
            default: false,
        },
        displayOrder: {
            type: Number,
            default: 0,
        },
        // Dynamic Parameters for UI generation
        parameters: [
            {
                key: { type: String, required: true },
                label: { type: String, required: true },
                type: {
                    type: String,
                    enum: ["number", "string", "select", "boolean", "slider"],
                    default: "string"
                },
                defaultValue: mongoose.Schema.Types.Mixed,
                options: [String], // for select type
                min: Number,       // for number/slider
                max: Number,       // for number/slider
                step: Number,      // for slider
                unit: String,      // e.g. "s", "px", "steps"
                description: String,
                required: { type: Boolean, default: false }
            }
        ],
    },
    {
        timestamps: true,
    }
);

// Indexes for faster querying
modelSchema.index({ status: 1, type: 1 });
modelSchema.index({ provider: 1 });
modelSchema.index({ displayOrder: 1 });

// Virtual for success rate
modelSchema.virtual("successRate").get(function () {
    if (this.stats.totalGenerations === 0) return 0;
    return (this.stats.successfulGenerations / this.stats.totalGenerations) * 100;
});

// Method to increment generation stats
modelSchema.methods.incrementGenerationStats = async function (success, generationTime) {
    this.stats.totalGenerations += 1;
    if (success) {
        this.stats.successfulGenerations += 1;
    } else {
        this.stats.failedGenerations += 1;
    }

    // Update average generation time
    const currentTotal = this.stats.averageGenerationTime * (this.stats.totalGenerations - 1);
    this.stats.averageGenerationTime = (currentTotal + generationTime) / this.stats.totalGenerations;

    await this.save();
};

const Model = mongoose.model("Model", modelSchema);

export default Model;
