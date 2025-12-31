/**
 * Watermark Utility
 * Handles watermark application for free tier content
 */

/**
 * Watermark configuration
 */
export const watermarkConfig = {
    text: "PIXORA",
    position: "bottom-right",
    opacity: 0.6,
    fontSize: 24,
    color: "#FFFFFF",
    padding: 20,
    fontFamily: "Arial, sans-serif",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
};

/**
 * Apply watermark metadata to content
 * Note: Actual watermark rendering will be done by the AI generation service
 * This function prepares the watermark configuration
 * 
 * @param {Object} options - Watermark options
 * @returns {Object} Watermark configuration
 */
export const prepareWatermark = (options = {}) => {
    return {
        ...watermarkConfig,
        ...options,
        enabled: true,
        timestamp: new Date().toISOString(),
    };
};

/**
 * Check if content should have watermark
 * @param {Object} user - User object
 * @param {boolean} isFreeTier - Whether this is a free tier generation
 * @returns {boolean}
 */
export const shouldApplyWatermark = (user, isFreeTier = false) => {
    // Apply watermark if:
    // 1. User is using free tier generation
    // 2. User has free plan subscription
    if (isFreeTier) return true;
    if (user.subscriptionPlan === 'free' && user.credits === 0) return true;

    return false;
};

/**
 * Get watermark removal eligibility
 * @param {Object} user - User object
 * @returns {Object} Eligibility status
 */
export const canRemoveWatermark = (user) => {
    const hasPaidPlan = user.subscriptionPlan !== 'free';
    const hasCredits = user.credits > 0;

    return {
        eligible: hasPaidPlan || hasCredits,
        reason: hasPaidPlan
            ? 'User has paid subscription'
            : hasCredits
                ? 'User has purchased credits'
                : 'User needs to upgrade or purchase credits',
    };
};

/**
 * Generate watermark text with timestamp
 * @param {string} customText - Optional custom text
 * @returns {string}
 */
export const generateWatermarkText = (customText = null) => {
    return customText || watermarkConfig.text;
};

/**
 * Apply watermark to image (placeholder for actual implementation)
 * This will be implemented when AI generation is added
 * 
 * @param {Buffer} imageBuffer - Image buffer
 * @param {Object} options - Watermark options
 * @returns {Promise<Buffer>} Watermarked image buffer
 */
export const applyImageWatermark = async (imageBuffer, options = {}) => {
    // TODO: Implement actual watermark application using sharp or canvas
    // For now, return the original buffer with metadata
    return imageBuffer;
};

/**
 * Apply watermark to video (placeholder for actual implementation)
 * This will be implemented when AI generation is added
 * 
 * @param {string} videoPath - Path to video file
 * @param {Object} options - Watermark options
 * @returns {Promise<string>} Path to watermarked video
 */
export const applyVideoWatermark = async (videoPath, options = {}) => {
    // TODO: Implement actual watermark application using ffmpeg
    // For now, return the original path with metadata
    return videoPath;
};

export default {
    watermarkConfig,
    prepareWatermark,
    shouldApplyWatermark,
    canRemoveWatermark,
    generateWatermarkText,
    applyImageWatermark,
    applyVideoWatermark,
};
