import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const contentSchema = new mongoose.Schema({
    type: String,
    url: String,
    thumbnailUrl: String,
    remoteUrl: String,
    generationId: String,
    metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const Content = mongoose.model('Content', contentSchema);

async function findFile() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pixora';
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        // Search for the specific file ID I found
        const searchTerm = '696606';
        const records = await Content.find({
            $or: [
                { url: { $regex: searchTerm } },
                { thumbnailUrl: { $regex: searchTerm } },
                { generationId: { $regex: searchTerm } },
                { 'metadata.localFilePath': { $regex: searchTerm } }
            ]
        });

        console.log(`Found ${records.length} records matching ${searchTerm}`);
        records.forEach(r => {
            console.log(`ID: ${r._id}, Type: ${r.type}, Created: ${r.createdAt}`);
            console.log(`URL: ${r.url}`);
            console.log(`GenID: ${r.generationId}`);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

findFile();
