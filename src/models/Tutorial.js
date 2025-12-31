import mongoose from "mongoose";

const tutorialSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    duration: {
        type: String, // e.g., "8:24"
        required: true
    },
    level: {
        type: String,
        enum: ["Beginner", "Intermediate", "Advanced"],
        default: "Beginner"
    },
    thumbnail: {
        type: String,
        default: "https://picsum.photos/seed/tutorial/400/225"
    },
    category: {
        type: String,
        required: true, // e.g., "Video AI", "Image AI"
        index: true
    },
    videoUrl: {
        type: String,
        default: ""
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Tutorial = mongoose.model("Tutorial", tutorialSchema);

export default Tutorial;
