/**
 * Base Provider Class
 * Abstract class for all AI providers
 */
class BaseProvider {
    constructor(apiKey, config = {}) {
        if (this.constructor === BaseProvider) {
            throw new Error("BaseProvider is an abstract class and cannot be instantiated directly");
        }

        this.apiKey = apiKey;
        this.config = {
            timeout: config.timeout || 120000,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 2000,
            ...config,
        };
    }

    /**
     * Generate content (must be implemented by subclasses)
     * @param {Object} params - Generation parameters
     * @returns {Promise<Object>} - Generation result
     */
    async generate(params) {
        throw new Error("generate() must be implemented by subclass");
    }

    /**
     * Check generation status
     * @param {string} jobId - Job identifier
     * @returns {Promise<Object>} - Status result
     */
    async checkStatus(jobId) {
        throw new Error("checkStatus() must be implemented by subclass");
    }

    /**
     * Get available models
     * @returns {Promise<Array>} - List of models
     */
    async getModels() {
        throw new Error("getModels() must be implemented by subclass");
    }

    /**
     * Validate parameters before generation
     * @param {Object} params - Parameters to validate
     * @returns {Object} - Validation result
     */
    validateParams(params) {
        const errors = [];

        if (!params.prompt || params.prompt.trim().length === 0) {
            errors.push("Prompt is required");
        }

        if (params.prompt && params.prompt.length > 1000) {
            errors.push("Prompt is too long (max 1000 characters)");
        }

        if (params.type && !["video", "image"].includes(params.type)) {
            errors.push("Type must be 'video' or 'image'");
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Retry logic wrapper
     * @param {Function} fn - Function to retry
     * @param {number} retries - Number of retries
     * @returns {Promise<any>} - Result of function
     */
    async retry(fn, retries = this.config.maxRetries) {
        let lastError;

        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                console.warn(`Attempt ${i + 1} failed:`, error.message);

                if (i < retries - 1) {
                    await this.delay(this.config.retryDelay * (i + 1));
                }
            }
        }

        throw lastError;
    }

    /**
     * Delay helper
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Normalize response from provider
     * @param {Object} response - Raw provider response
     * @returns {Object} - Normalized response
     */
    normalizeResponse(response) {
        return {
            success: true,
            url: response.url || response.data?.url,
            thumbnailUrl: response.thumbnailUrl || response.data?.thumbnailUrl,
            status: response.status || "completed",
            metadata: response.metadata || {},
        };
    }

    /**
     * Handle errors
     * @param {Error} error - Error object
     * @returns {Object} - Formatted error response
     */
    handleError(error) {
        console.error("Provider Error:", error);

        let message = "An error occurred during generation";
        let statusCode = 500;

        if (error.response) {
            // HTTP error
            statusCode = error.response.status;
            message = error.response.data?.message || error.response.statusText;
        } else if (error.request) {
            // Network error
            message = "Network error - unable to reach AI provider";
            statusCode = 503;
        } else {
            // Other error
            message = error.message;
        }

        return {
            success: false,
            error: message,
            statusCode,
        };
    }

    /**
     * Make HTTP request with timeout
     * @param {string} url - Request URL
     * @param {Object} options - Request options
     * @returns {Promise<Object>} - Response
     */
    async makeRequest(url, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json",
                    ...options.headers,
                },
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeout);
            if (error.name === "AbortError") {
                throw new Error("Request timeout");
            }
            throw error;
        }
    }
}

export default BaseProvider;
