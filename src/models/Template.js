import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please provide a template title'],
        trim: true,
        maxlength: [80, 'Title cannot exceed 80 characters']
    },
    description: {
        type: String,
        required: [true, 'Please provide a description'],
        trim: true,
        maxlength: [160, 'Description cannot exceed 160 characters']
    },
    promptText: {
        type: String,
        required: [true, 'Please provide prompt text'],
        trim: true,
        minlength: [20, 'Prompt text must be at least 20 characters to affect AI generation']
    },
    // Generator Type Mapping (replaces contentType)
    generatorType: {
        type: String,
        enum: ['text-to-video', 'image-to-video', 'text-to-image', 'image-to-image'],
        required: [true, 'Please provide generator type'],
        index: true
    },
    // Legacy field for backward compatibility
    contentType: {
        type: String,
        enum: ['textToVideo', 'imageToVideo', 'textToImage', 'imageToImage']
    },
    // Template Category (image or video)
    category: {
        type: String,
        enum: ['image', 'video'],
        required: [true, 'Please specify template category (image or video)'],
        index: true
    },
    // Subcategory for organization
    subcategory: {
        type: String,
        enum: ['business', 'social', 'education', 'entertainment', 'personal', 'design', 'other'],
        default: 'other',
        index: true
    },
    // Preview Media (MANDATORY)
    previewUrl: {
        type: String,
        required: [true, 'Preview file is required'],
        trim: true
    },
    previewType: {
        type: String,
        enum: ['video', 'gif'],
        required: [true, 'Preview type is required']
    },
    // Model Reference
    modelId: {
        type: String,
        required: [true, 'Please specify a target model ID'],
        index: true
    },
    // Prompt Configuration
    promptEditable: {
        type: Boolean,
        default: true
    },
    // Parameter Presets
    parameters: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },
    // Input Requirements
    inputRequirements: {
        requiresImage: {
            type: Boolean,
            default: false
        },
        requiresVideo: {
            type: Boolean,
            default: false
        },
        maxUploads: {
            type: Number,
            default: 1,
            min: 1,
            max: 10
        }
    },
    // Status Fields
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    isPublic: {
        type: Boolean,
        default: false,
        index: true
    },
    duration: {
        type: String,
        validate: {
            validator: function (v) {
                return /^([0-5]?[0-9]):([0-5][0-9])$/.test(v) || v === '';
            },
            message: 'Duration must be in format MM:SS'
        }
    },
    credits: {
        type: Number,
        default: 1,
        min: [0, 'Credits cannot be negative'],
        max: [100, 'Credits cannot exceed 100']
    },
    isPopular: {
        type: Boolean,
        default: false
    },
    uses: {
        type: Number,
        default: 0,
        min: 0
    },
    rating: {
        type: Number,
        default: 5.0,
        min: [0, 'Rating cannot be less than 0'],
        max: [5, 'Rating cannot exceed 5']
    },
    lastTestedAt: {
        type: Date,
        default: Date.now
    },
    isTested: {
        type: Boolean,
        default: false
    },
    qualityScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 10
    },
    tags: [{
        type: String,
        trim: true
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    // Legacy thumbnail field (kept for backward compatibility)
    thumbnail: {
        type: String,
        trim: true,
        default: ""
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for better query performance
templateSchema.index({ isActive: 1, isPublic: 1, category: 1 });
templateSchema.index({ isActive: 1, isPublic: 1, isPopular: 1 });
templateSchema.index({ generatorType: 1, category: 1 });
templateSchema.index({ title: 'text', description: 'text', promptText: 'text' });

// Virtual for template status
templateSchema.virtual('status').get(function () {
    if (!this.isActive) return 'disabled';
    if (!this.isPublic) return 'hidden';
    if (!this.isTested) return 'untested';
    return 'active';
});

// Pre-save middleware
templateSchema.pre('save', function (next) {
    this.updatedAt = Date.now();

    // Backward compatibility: sync contentType with generatorType
    if (this.isModified('generatorType') && this.generatorType) {
        const generatorToContentType = {
            'text-to-video': 'textToVideo',
            'image-to-video': 'imageToVideo',
            'text-to-image': 'textToImage',
            'image-to-image': 'imageToImage'
        };
        this.contentType = generatorToContentType[this.generatorType];
    }

    // Auto-calculate quality score based on various factors
    if (this.isModified('promptText')) {
        const wordCount = this.promptText.split(/\s+/).length;
        this.qualityScore = Math.min(10, Math.floor(wordCount / 5));
        this.lastTestedAt = Date.now();
    }

    next();
});

// Static method to get active public templates
templateSchema.statics.getPublicTemplates = function (filters = {}) {
    return this.find({
        isActive: true,
        isPublic: true,
        isTested: true,
        ...filters
    }).sort({ isPopular: -1, uses: -1, createdAt: -1 });
};


// Instance method to increment uses
templateSchema.methods.incrementUses = function () {
    this.uses += 1;
    return this.save();
};

// Instance method to test template
templateSchema.methods.markAsTested = function (qualityScore) {
    this.isTested = true;
    this.lastTestedAt = Date.now();
    if (qualityScore) this.qualityScore = qualityScore;
    return this.save();
};

const Template = mongoose.model('Template', templateSchema);

export default Template;