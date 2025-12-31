import BaseProvider from "./BaseProvider.js";

/**
 * OpenAI Provider
 * Used for AI-powered prompt generation and enhancement
 */
class OpenAIProvider extends BaseProvider {
    constructor(apiKey, config = {}) {
        super(apiKey, config);
        this.baseUrl = config.baseUrl || "https://api.openai.com/v1";
        this.model = config.model || "gpt-4";
    }

    /**
     * Generate creative prompt ideas based on user input
     * @param {Object} params - Generation parameters
     * @returns {Promise<Object>} - Prompt ideas
     */
    async generatePromptIdeas(params) {
        const {
            context = "text-to-video",
            userInput = "",
            count = 4,
            style,
        } = params;

        const systemPrompt = this.getSystemPrompt(context, style);
        const userPrompt = userInput
            ? `Generate creative prompt ideas based on this input: "${userInput}"`
            : "Generate creative and diverse prompt ideas for AI content generation";

        try {
            const result = await this.retry(async () => {
                return await this.makeRequest(`${this.baseUrl}/chat/completions`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: this.model,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userPrompt },
                        ],
                        temperature: 0.8,
                        max_tokens: 500,
                        n: count,
                    }),
                });
            });

            // Extract prompts from response
            const prompts = result.choices.map(choice => choice.message.content.trim());

            return {
                success: true,
                prompts,
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    /**
     * Enhance a user's prompt with better details
     * @param {string} prompt - Original prompt
     * @param {string} context - Context (video/image)
     * @returns {Promise<Object>} - Enhanced prompt
     */
    async enhancePrompt(prompt, context = "video") {
        const systemPrompt = `You are an AI prompt enhancement expert. Your job is to take a simple prompt and make it more detailed and effective for ${context} generation. Add specific details about lighting, camera angles, atmosphere, colors, and style while preserving the user's original intent. Keep it under 200 words.`;

        try {
            const result = await this.retry(async () => {
                return await this.makeRequest(`${this.baseUrl}/chat/completions`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: this.model,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: `Enhance this prompt: "${prompt}"` },
                        ],
                        temperature: 0.7,
                        max_tokens: 300,
                    }),
                });
            });

            return {
                success: true,
                enhancedPrompt: result.choices[0].message.content.trim(),
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    /**
     * Get system prompt based on context
     * @param {string} context - Context type
     * @param {string} style - Optional style
     * @returns {string} - System prompt
     */
    getSystemPrompt(context, style) {
        const basePrompt = "You are an expert AI content prompt generator.";

        const contextPrompts = {
            "text-to-video": "Generate creative prompts for video generation. Focus on scenes with movement, camera work, lighting, and atmosphere. Each prompt should be vivid, detailed, and cinematic.",
            "text-to-image": "Generate creative prompts for image generation. Focus on composition, lighting, colors, mood, and artistic style. Each prompt should be visually striking and detailed.",
            "image-to-video": "Generate prompts that describe how a static image should animate. Focus on motion, camera movement, and dynamic elements.",
        };

        let prompt = `${basePrompt} ${contextPrompts[context] || contextPrompts["text-to-video"]}`;

        if (style) {
            prompt += ` The style should be ${style}.`;
        }

        prompt += " Return ONLY the prompts, one per line, without numbering or additional explanation.";

        return prompt;
    }

    /**
     * Not used for OpenAI (implements abstract method)
     */
    async generate(params) {
        throw new Error("Use generatePromptIdeas() for OpenAI provider");
    }

    /**
     * Not used for OpenAI (implements abstract method)
     */
    async checkStatus(jobId) {
        throw new Error("Status checking not applicable for OpenAI provider");
    }

    /**
     * Get available models (OpenAI models)
     */
    async getModels() {
        return [
            { id: "gpt-4", name: "GPT-4" },
            { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
        ];
    }
}

export default OpenAIProvider;
