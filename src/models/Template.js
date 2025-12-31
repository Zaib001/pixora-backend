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
        required: [true, 'Please provide a thumbnail URL']
    },
    previewUrl: {
        type: String,
        required: [true, 'Please provide a preview URL (video/image)']
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
