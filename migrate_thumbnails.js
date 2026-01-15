import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const contentSchema = new mongoose.Schema({
    type: String,
    thumbnailUrl: String,
    url: String,
    generationId: String
}, { timestamps: true });

const Content = mongoose.model('Content', contentSchema);

async function migrate() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pixora';
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const baseUrl = process.env.BACKEND_URL || 'http://localhost:5000';

        // 1. Fix videos whose thumbnailUrl is same as stream/video
        const videos = await Content.find({
            type: 'video',
            thumbnailUrl: { $regex: '/stream/video/' }
        });

        console.log(`Found ${videos.length} videos needing thumbnail fix`);

        for (const video of videos) {
            // Extract ID from current thumbnailUrl
            const parts = video.thumbnailUrl.split('/');
            const id = parts[parts.length - 1];

            const newThumb = `${baseUrl}/api/content/stream/image/${id}`;
            await Content.updateOne({ _id: video._id }, { $set: { thumbnailUrl: newThumb } });
        }

        // 2. Fix images - ensure they all point to stream/image if local file might exist
        const images = await Content.find({
            type: 'image',
            thumbnailUrl: { $exists: false }
        });
        console.log(`Found ${images.length} images needing thumbnail set`);

        await mongoose.disconnect();
        console.log('Migration completed');
    } catch (error) {
        console.error('Migration failed:', error);
    }
}

migrate();
