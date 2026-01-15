import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from current directory
dotenv.config();

const contentSchema = new mongoose.Schema({
    type: String,
    status: String,
    url: String,
    thumbnailUrl: String,
    remoteUrl: String,
    generationId: String,
    metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const Content = mongoose.model('Content', contentSchema);

async function checkContent() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pixora';
        console.log('Connecting to:', uri);
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const latestContent = await Content.find().sort({ createdAt: -1 }).limit(5);

        console.log('--- Latest Content Records ---');
        latestContent.forEach((c, i) => {
            console.log(JSON.stringify(c.toObject(), null, 4));
            console.log('---------------------------');
        });

        const total = await Content.countDocuments();
        console.log(`Total records: ${total}`);

        if (total > 0) {
            const first = await Content.findOne().sort({ createdAt: 1 });
            const last = await Content.findOne().sort({ createdAt: -1 });
            console.log(`First record created at: ${first.createdAt}`);
            console.log(`Last record created at: ${last.createdAt}`);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkContent();
