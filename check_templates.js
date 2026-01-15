import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const templateSchema = new mongoose.Schema({
    title: String,
    thumbnail: String,
    previewUrl: String,
    isActive: Boolean
});

const Template = mongoose.model('Template', templateSchema);

async function checkTemplates() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pixora';
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const templates = await Template.find().limit(5);

        console.log('--- Templates ---');
        templates.forEach((t, i) => {
            console.log(`[${i}] Title: ${t.title}`);
            console.log(`    Thumbnail: ${t.thumbnail}`);
            console.log(`    PreviewUrl: ${t.previewUrl}`);
            console.log(`    IsActive: ${t.isActive}`);
            console.log('---------------------------');
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkTemplates();
