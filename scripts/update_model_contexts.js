
/*
 * Migration Script: Update Model Contexts
 * 
 * This script updates existing models to include specific 'supportedContexts'
 * based on user-defined rules.
 * 
 * Rules:
 * - sora-2, sora-2-pro -> ['text-to-video']
 * - kling-v1, kling-2.0 -> ['image-to-video']
 * - dall-e-3, flux-context-pro, gpt-image-1 -> ['text-to-image']
 * - Others -> Default based on type
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Model from '../src/models/Model.js';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const updateContexts = async () => {
    try {
        await connectDB();

        console.log('Starting migration...');

        // 1. Text-to-Video (Sora)
        const soraResult = await Model.updateMany(
            { modelId: { $in: ['sora-2', 'sora-2-pro'] } },
            { $set: { supportedContexts: ['text-to-video'] } }
        );
        console.log(`Updated Sora models: ${soraResult.modifiedCount}`);

        // 2. Image-to-Video (Kling)
        const klingResult = await Model.updateMany(
            { modelId: { $in: ['kling-v1', 'kling-2.0', 'kling-1.6'] } }, // Added 1.6 just in case
            { $set: { supportedContexts: ['image-to-video'] } }
        );
        console.log(`Updated Kling models: ${klingResult.modifiedCount}`);

        // 3. Text-to-Image (DALL-E, Flux, GPT)
        // Using $regex for flexible matching if needed, but exact IDs are safer for now specific list
        const imageResult = await Model.updateMany(
            {
                $or: [
                    { modelId: 'dall-e-3' },
                    { modelId: 'gpt-image-1' },
                    { modelId: { $regex: /flux/i } } // Matches flux-context-pro, flux-pro, etc.
                ]
            },
            { $set: { supportedContexts: ['text-to-image'] } }
        );
        console.log(`Updated Image models: ${imageResult.modifiedCount}`);

        // 4. Fallback: If no contexts set, infer from type (Safe default)
        // We only want to set this if supportedContexts is empty to avoid overwriting rules
        const videoFallback = await Model.updateMany(
            { type: 'video', supportedContexts: { $size: 0 } },
            { $set: { supportedContexts: ['text-to-video', 'image-to-video'] } }
        );
        console.log(`Updated generic video models (Fallback): ${videoFallback.modifiedCount}`);

        const imageFallback = await Model.updateMany(
            { type: 'image', supportedContexts: { $size: 0 } },
            { $set: { supportedContexts: ['text-to-image', 'image-to-image'] } }
        );
        console.log(`Updated generic image models (Fallback): ${imageFallback.modifiedCount}`);

        console.log('Migration complete!');
        process.exit(0);

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

updateContexts();
