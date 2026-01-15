
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Model from './src/models/Model.js';

dotenv.config();

// MongoDB Connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB Connected for Seeding");
    } catch (err) {
        console.error("MongoDB Connection Failed:", err);
        process.exit(1);
    }
};

const seedModels = async () => {
    await connectDB();

    const models = [
        // --- VIDEO MODELS ---
        {
            modelId: "sora-2",
            name: "Sora 2",
            provider: "competapi",
            type: "video",
            description: "High-quality text-to-video generation.",
            pricing: { costPerSecond: 10, costPerImage: 0 },
            status: "active",
            isPopular: true,
            parameters: [
                {
                    key: "duration",
                    label: "Duration (Seconds)",
                    type: "select",
                    defaultValue: "4",
                    options: ["4", "8", "12"],
                    required: true,
                    description: "Length of the generated video."
                },
                {
                    key: "aspectRatio",
                    label: "Aspect Ratio",
                    type: "select",
                    defaultValue: "16:9",
                    options: ["16:9", "9:16"],
                    required: true,
                    description: "Screen dimensions."
                }
            ]
        },
        {
            modelId: "sora-2-pro",
            name: "Sora 2 Pro",
            provider: "competapi",
            type: "video",
            description: "Professional tier text-to-video with enhanced detail.",
            pricing: { costPerSecond: 15, costPerImage: 0 },
            status: "active",
            parameters: [
                {
                    key: "duration",
                    label: "Duration (Seconds)",
                    type: "select",
                    defaultValue: "4",
                    options: ["4", "8", "12"],
                    required: true
                },
                {
                    key: "aspectRatio",
                    label: "Aspect Ratio",
                    type: "select",
                    defaultValue: "16:9",
                    options: ["16:9", "9:16"],
                    required: true
                }
            ]
        },
        {
            modelId: "kling-v1",
            name: "Kling v1 (Image-to-Video)",
            provider: "competapi",
            type: "video", // Frontend handles this as video model available in Img2Vid
            description: "Turn images into dynamic videos.",
            pricing: { costPerSecond: 12, costPerImage: 0 },
            status: "active",
            parameters: [
                {
                    key: "duration",
                    label: "Duration",
                    type: "select",
                    defaultValue: "5",
                    options: ["5", "10"],
                    required: true
                },
                {
                    key: "mode",
                    label: "Mode",
                    type: "select",
                    defaultValue: "pro",
                    options: ["std", "pro"],
                    required: true,
                    description: "Standard or Professional quality."
                },
                {
                    key: "cfg_scale",
                    label: "Creativity (CFG)",
                    type: "slider",
                    defaultValue: 0.5,
                    min: 0.0,
                    max: 1.0,
                    step: 0.1,
                    required: false,
                    description: "Balance between prompt adherence and creativity."
                }
            ]
        },

        // --- IMAGE MODELS ---
        {
            modelId: "dall-e-3",
            name: "DALL-E 3",
            provider: "competapi",
            type: "image",
            description: "Advanced text-to-image generation by OpenAI.",
            pricing: { costPerImage: 4, costPerSecond: 0 },
            status: "active",
            isPopular: true,
            parameters: [
                {
                    key: "size",
                    label: "Image Size",
                    type: "select",
                    defaultValue: "1024x1024",
                    options: ["1024x1024", "512x512", "256x256"], // Added smaller sizes per code
                    required: true
                },
                {
                    key: "quality",
                    label: "Quality",
                    type: "select",
                    defaultValue: "standard",
                    options: ["standard", "hd"],
                    required: false
                }
            ]
        },
        {
            modelId: "flux-kontext-pro",
            name: "FLUX Context Pro",
            provider: "competapi",
            type: "image",
            description: "High-fidelity artistic image generation.",
            pricing: { costPerImage: 3, costPerSecond: 0 },
            status: "active",
            parameters: [
                {
                    key: "size",
                    label: "Size",
                    type: "select",
                    defaultValue: "1024x1024",
                    options: ["1024x1024", "512x512"],
                    required: true
                }
            ]
        },
        {
            modelId: "gpt-image-1",
            name: "GPT Image 1",
            provider: "competapi",
            type: "image",
            description: "General purpose image generation and editing.",
            pricing: { costPerImage: 2, costPerSecond: 0 },
            status: "active",
            parameters: [
                {
                    key: "size",
                    label: "Size",
                    type: "select",
                    defaultValue: "1024x1024",
                    options: ["1024x1024", "512x512"],
                    required: true
                }
            ]
        }
    ];

    try {
        // Clear existing models if needed or upsert
        // We will upsert based on modelId
        for (const model of models) {
            await Model.findOneAndUpdate(
                { modelId: model.modelId },
                model,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            console.log(`Synced model: ${model.name}`);
        }
        console.log("All models seeded successfully.");
    } catch (error) {
        console.error("Error seeding models:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
    }
};

seedModels();
