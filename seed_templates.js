import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Template from './src/models/Template.js';

dotenv.config();

// MongoDB Connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/pixora");
        console.log("MongoDB Connected for Seeding");
    } catch (err) {
        console.error("MongoDB Connection Failed:", err);
        process.exit(1);
    }
};

const templates = [
    // --- TEXT TO VIDEO ---
    {
        title: "Cinematic Product Reveal",
        description: "High-end product showcase with smooth camera movement and dramatic lighting.",
        promptText: "Cinematic close-up of a luxury perfume bottle, golden lighting, slow rotation, 4k resolution, photorealistic, bokeh background, particles floating",
        contentType: "textToVideo",
        modelId: "kling-v1",
        category: "business",
        credits: 15,
        isPublic: true,
        isActive: true,
        isTested: true,
        isPopular: true,
        uses: 1250,
        rating: 4.8,
        previewUrl: "https://cdn.pixora.com/previews/product-reveal.mp4",
        parameters: {
            duration: 5,
            aspectRatio: "16:9",
            cameraZoom: 1.5,
            negativePrompt: "blurry, low quality, distorted, watermark"
        }
    },
    {
        title: "Cyberpunk City Flythrough",
        description: "Futuristic city aerial view with neon lights and flying cars.",
        promptText: "Cyberpunk city at night, neon lights, rain, aerial drone view, flying cars, blade runner style, volumetric fog, 8k",
        contentType: "textToVideo",
        modelId: "kling-v1",
        category: "entertainment",
        credits: 20,
        isPublic: true,
        isActive: true,
        isTested: true,
        uses: 890,
        rating: 4.9,
        parameters: {
            duration: 10,
            aspectRatio: "16:9",
            guidanceScale: 7.5
        }
    },

    // --- IMAGE TO VIDEO ---
    {
        title: "Photo to Living Portrait",
        description: "Animate a static portrait with subtle breathing and eye movement.",
        promptText: "Bring this portrait to life, subtle breathing, blinking eyes, slight head movement, photorealistic animation",
        contentType: "imageToVideo",
        modelId: "kling-v1",
        category: "personal",
        credits: 10,
        isPublic: true,
        isActive: true,
        isTested: true,
        isPopular: true,
        uses: 3400,
        inputRequirements: ["image"],
        parameters: {
            motionBucket: 127,
            noiseAugmentation: 0.1
        }
    },

    // --- TEXT TO IMAGE ---
    {
        title: "Corporate Headshot Background",
        description: "Professional office background for corporate headshots.",
        promptText: "Modern bright office background, blurred, professional bokeh, glass walls, daylight, minimal interior design",
        contentType: "textToImage",
        modelId: "flux-schnell",
        category: "business",
        credits: 5,
        isPublic: true,
        isActive: true,
        isTested: true,
        parameters: {
            width: 1024,
            height: 1024,
            steps: 25
        }
    },
    {
        title: "Fantasy Character Concept",
        description: "Detailed fantasy character design sheet.",
        promptText: "Full body character concept art of an elven ranger, intricate armor, forest background, digital painting, artstation style, sharp focus",
        contentType: "textToImage",
        modelId: "flux-schnell",
        category: "entertainment",
        credits: 5,
        isPublic: true,
        isActive: true,
        isTested: true,
        isPopular: true,
        parameters: {
            aspectRatio: "2:3",
            guidanceScale: 7.0
        }
    },

    // --- IMAGE TO IMAGE ---
    {
        title: "Sketch to Realistic Render",
        description: "Turn your rough sketches into photorealistic renders.",
        promptText: "Photorealistic render of the sketch, high detail, 8k, unreal engine 5, ray tracing",
        contentType: "imageToImage",
        modelId: "flux-schnell",
        category: "design",
        credits: 8,
        isPublic: true,
        isActive: true,
        isTested: true,
        inputRequirements: ["image"],
        parameters: {
            strength: 0.75, // Image strength
            steps: 30
        }
    }
];

const seedTemplates = async () => {
    try {
        await connectDB();

        console.log('Clearing existing templates...');
        await Template.deleteMany({});

        console.log('Seeding new templates...');
        const createdTemplates = await Template.insertMany(templates);

        console.log(`Successfully seeded ${createdTemplates.length} templates!`);
        process.exit(0);
    } catch (error) {
        console.error('Error seeding templates:', error);
        process.exit(1);
    }
};

seedTemplates();
