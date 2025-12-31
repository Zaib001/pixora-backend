import Tutorial from "../models/Tutorial.js";
import FAQ from "../models/FAQ.js";

// Default Data for Seeding
const defaultTutorials = [
    {
        title: "Getting Started with Text to Video",
        description: "Learn how to create stunning videos from text prompts",
        duration: "8:24",
        level: "Beginner",
        thumbnail: "https://picsum.photos/seed/tutorial1/400/225",
        category: "Video AI",
        isFeatured: true
    },
    {
        title: "Mastering Image to Image Transformations",
        description: "Advanced techniques for image style transfer and enhancement",
        duration: "12:45",
        level: "Intermediate",
        thumbnail: "https://picsum.photos/seed/tutorial2/400/225",
        category: "Image AI"
    },
    {
        title: "Prompt Engineering Best Practices",
        description: "Write effective prompts for better AI generation results",
        duration: "15:32",
        level: "Advanced",
        thumbnail: "https://picsum.photos/seed/tutorial3/400/225",
        category: "Tips & Tricks"
    },
    {
        title: "Video Style Customization Guide",
        description: "Customize cinematic styles and motion parameters",
        duration: "10:18",
        level: "Intermediate",
        thumbnail: "https://picsum.photos/seed/tutorial4/400/225",
        category: "Video AI"
    }
];

const defaultFAQs = [
    // Getting Started
    { question: "How do I create my first AI video?", answer: "Navigate to the Text to Video generator, enter your prompt, select a style, and click generate. Your video will be ready in 2-5 minutes.", category: "getting-started", order: 1 },
    { question: "What's the difference between credits and subscription?", answer: "Credits are pay-as-you-go for individual generations, while subscriptions provide monthly credit allowances and additional features.", category: "getting-started", order: 2 },
    { question: "Can I use generated content commercially?", answer: "Yes, all content generated on Pro and Enterprise plans includes commercial usage rights. Free plan content is for personal use only.", category: "getting-started", order: 3 },

    // Technical
    { question: "Why is my generation taking so long?", answer: "Video generation typically takes 2-5 minutes depending on length and complexity. High traffic periods may cause additional delays.", category: "technical", order: 1 },
    { question: "What video formats are supported?", answer: "We support MP4 output with various resolutions up to 4K. Images are generated in PNG and JPEG formats.", category: "technical", order: 2 },
    { question: "How do I improve generation quality?", answer: "Use detailed prompts, specify styles and lighting, and experiment with different aspect ratios for optimal results.", category: "technical", order: 3 },

    // Billing
    { question: "How do credit packs work?", answer: "Credit packs are one-time purchases that never expire. Each generation consumes credits based on complexity and duration.", category: "billing", order: 1 },
    { question: "Can I get a refund?", answer: "We offer refunds for unused credits within 14 days of purchase. Subscription refunds are handled on a case-by-case basis.", category: "billing", order: 2 },
    { question: "Do credits roll over?", answer: "Subscription credits reset monthly and don't roll over. Purchased credit packs never expire.", category: "billing", order: 3 }
];

// @desc    Get Help Content (Tutorials & FAQs)
// @route   GET /api/help
// @access  Public (or Private)
export const getHelpContent = async (req, res) => {
    try {
        // Auto-seed if empty
        const tutorialCount = await Tutorial.countDocuments();
        if (tutorialCount === 0) {
            await Tutorial.insertMany(defaultTutorials);
        }

        const faqCount = await FAQ.countDocuments();
        if (faqCount === 0) {
            await FAQ.insertMany(defaultFAQs);
        }

        const tutorials = await Tutorial.find().sort({ createdAt: -1 });
        const faqs = await FAQ.find().sort({ order: 1 });

        res.status(200).json({
            success: true,
            data: {
                tutorials,
                faqs
            }
        });
    } catch (error) {
        console.error("Get Help Content Error:", error);
        res.status(500).json({ message: "Failed to fetch help content" });
    }
};

// @desc    Create Tutorial
// @route   POST /api/help/tutorials
export const createTutorial = async (req, res) => {
    try {
        const tutorial = await Tutorial.create(req.body);
        res.status(201).json({ success: true, data: tutorial });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update Tutorial
// @route   PUT /api/help/tutorials/:id
export const updateTutorial = async (req, res) => {
    try {
        const tutorial = await Tutorial.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json({ success: true, data: tutorial });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete Tutorial
// @route   DELETE /api/help/tutorials/:id
export const deleteTutorial = async (req, res) => {
    try {
        await Tutorial.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: "Tutorial deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create FAQ
// @route   POST /api/help/faqs
export const createFAQ = async (req, res) => {
    try {
        const faq = await FAQ.create(req.body);
        res.status(201).json({ success: true, data: faq });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update FAQ
// @route   PUT /api/help/faqs/:id
export const updateFAQ = async (req, res) => {
    try {
        const faq = await FAQ.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json({ success: true, data: faq });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete FAQ
// @route   DELETE /api/help/faqs/:id
export const deleteFAQ = async (req, res) => {
    try {
        await FAQ.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: "FAQ deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
