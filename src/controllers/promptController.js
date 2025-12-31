import AIConfig from "../models/AIConfig.js";
import CompetAPIProvider from "../utils/aiProviders/CompetAPIProvider.js";

// @desc    Generate AI prompt ideas
// @route   POST /api/prompts/ideas
// @access  Private
export const generatePromptIdeas = async (req, res) => {
    try {
        const { context = "text-to-video", userInput = "", style, count = 4 } = req.body;

        // Get API key from config
        const config = await AIConfig.findOne({ configKey: "global" });

        if (!config) {
            return res.status(400).json({
                success: false,
                message: "AI configuration not found. Please contact administrator.",
            });
        }

        // Check if AI Ideas feature is enabled
        if (!config.features.enableAIIdeas) {
            return res.status(403).json({
                success: false,
                message: "AI Ideas feature is currently disabled.",
            });
        }

        const apiKey = config.getApiKey("competapi") || process.env.COMPETAPI_KEY;

        if (!apiKey) {
            // Fallback to static prompts if API is not configured
            return res.status(200).json({
                success: true,
                data: {
                    prompts: getFallbackPrompts(context),
                    isFallback: true,
                },
                message: "Using fallback prompts (API not configured)",
            });
        }

        const provider = new CompetAPIProvider(apiKey);

        const result = await provider.generatePromptIdeas({
            context,
            userInput,
            style,
            count,
        });

        if (!result.success) {
            // Return fallback on error
            return res.status(200).json({
                success: true,
                data: {
                    prompts: getFallbackPrompts(context),
                    isFallback: true,
                },
                message: "Using fallback prompts (AI service unavailable)",
            });
        }

        res.status(200).json({
            success: true,
            data: {
                prompts: result.prompts,
                isFallback: false,
            },
            message: "AI prompt ideas generated successfully.",
        });
    } catch (error) {
        console.error("Generate Prompt Ideas Error:", error);

        // Return fallback prompts on error
        res.status(200).json({
            success: true,
            data: {
                prompts: getFallbackPrompts(req.body.context || "text-to-video"),
                isFallback: true,
            },
            message: "Using fallback prompts due to error.",
        });
    }
};

// @desc    Enhance user prompt
// @route   POST /api/prompts/enhance
// @access  Private
export const enhancePrompt = async (req, res) => {
    try {
        const { prompt, context = "video" } = req.body;

        if (!prompt || prompt.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "Prompt is required.",
            });
        }

        const config = await AIConfig.findOne({ configKey: "global" });

        if (!config) {
            return res.status(400).json({
                success: false,
                message: "AI configuration not found.",
            });
        }

        const apiKey = config.getApiKey("competapi") || process.env.COMPETAPI_KEY;

        if (!apiKey) {
            return res.status(200).json({
                success: true,
                data: {
                    enhancedPrompt: prompt, // Return original if enhancement not available
                },
                message: "Prompt enhancement not available (API not configured)",
            });
        }

        const provider = new CompetAPIProvider(apiKey);

        const enhancedPrompt = await provider.enhancePrompt(prompt);

        if (!enhancedPrompt || enhancedPrompt === prompt) {
            return res.status(200).json({
                success: true,
                data: {
                    enhancedPrompt: prompt,
                },
                message: "Using original prompt (enhancement failed)",
            });
        }

        res.status(200).json({
            success: true,
            data: {
                enhancedPrompt: enhancedPrompt,
            },
            message: "Prompt enhanced successfully.",
        });
    } catch (error) {
        console.error("Enhance Prompt Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to enhance prompt.",
            error: error.message,
        });
    }
};

/**
 * Fallback prompts when AI is not available
 */
function getFallbackPrompts(context) {
    const prompts = {
        "text-to-video": [
            "A futuristic neon-lit Tokyo street with flying cars and holographic advertisements at night",
            "A serene mountain landscape at sunrise with misty valleys and golden light",
            "An underwater coral reef with colorful fish and sunbeams filtering through the water",
            "A steampunk city with brass machinery, steam vents, and Victorian architecture",
        ],
        "text-to-image": [
            "A majestic dragon perched on a mountain peak, overlooking a fantasy kingdom at sunset",
            "A cyberpunk street market with neon signs, rain-soaked streets, and diverse characters",
            "A peaceful Zen garden with cherry blossoms, koi pond, and traditional Japanese architecture",
            "An astronaut floating in space with Earth in the background and distant galaxies",
        ],
        "image-to-video": [
            "Camera slowly zooms into the scene while elements gently move in the wind",
            "Subtle parallax effect as the camera pans across the scene from left to right",
            "Dynamic lighting changes as if clouds are passing over the scene",
            "Gentle particle effects like falling snow or floating embers appear in the scene",
        ],
    };

    return prompts[context] || prompts["text-to-video"];
}
