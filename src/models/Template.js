import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please provide a template title'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Please provide a description']
    },
    thumbnailUrl: {
        type: String,
        required: false,
        default: 'https://placehold.co/600x400?text=Pixora+Template'
    },
    previewUrl: {
        type: String,
        required: false,
        default: 'https://placehold.co/600x400?text=Pixora+Preview'
    },
    promptText: {
        type: String,
        required: [true, 'Please provide prompt text'],
        trim: true
    },
    contentType: {
        type: String,
        enum: ['textToVideo', 'imageToVideo', 'textToImage', 'imageToImage'],
        required: [true, 'Please provide content type'],
        default: 'textToVideo'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    category: {
        type: String,
        enum: ['business', 'social', 'education', 'entertainment', 'personal', 'other'],
        default: 'other'
    },
    duration: {
        type: String, // e.g., "2:00"
        required: false
    },
    credits: {
        type: Number,
        default: 1,
        min: 0
    },
    isPopular: {
        type: Boolean,
        default: false
    },
    uses: {
        type: Number,
        default: 0
    },
    rating: {
        type: Number,
        default: 5.0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('Template', templateSchema);
