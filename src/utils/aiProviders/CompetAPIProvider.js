import BaseProvider from "./BaseProvider.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * CompetAPI Provider - Real implementation based on official documentation
 * Supports video models: sora-2, veo3.1, runway-gen4, kling-2.0, luma, etc.
 * Supports image models: midjourney, flux, wanx-2.2-plus-img, etc.
 */
class CompetAPIProvider extends BaseProvider {
    constructor(apiKey, config = {}) {
        super(apiKey, config);
        this.baseUrl = "https://api.cometapi.com/v1";
        this.pollInterval = 10000; // 10 seconds
        this.maxPollAttempts = 60; // 10 minutes total
    }

    /**
     * Sleep utility for polling
     */
    async sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Generate content (video or image)
     */
    async generate(params) {
        const { type, prompt, model: modelId, aspectRatio, duration, imageUrl, cfg_scale, mask, quality, size, n, mode } = params;

        // Determine if it's video or image generation
        // Determine if it's video or image generation
        if (type === "video") {
            const enhancedPrompt = this._enhancePrompt(prompt, params.style, "video");
            if (imageUrl) {
                return await this.generateImageToVideo(imageUrl, enhancedPrompt, duration, mode, cfg_scale);
            }
            return await this.generateVideo(enhancedPrompt, modelId, aspectRatio, duration);
        } else if (type === "image") {
            // Check if it's image editing (has imageUrl + prompt) or generation
            if (imageUrl && prompt) {
                return await this.generateImageEdit(imageUrl, prompt, modelId, mask, quality, size, n);
            }
            return await this.generateImage(prompt, modelId, aspectRatio, imageUrl);
        } else {
            throw new Error(`Unsupported generation type: ${type}`);
        }
    }

    /**
     * Generate video using CompetAPI
     */
    /**
     * Generate video using CompetAPI
     */
    async generateVideo(prompt, modelId, aspectRatio, duration) {
        try {
            // Strict Parameter Enforcement

            // 1. Model: Default to sora-2, allow sora-2-pro
            // If modelId is passed but not one of the allowed, default to sora-2
            let model = "sora-2";
            if (modelId === "sora-2-pro" || modelId === "sora-2") {
                model = modelId;
            }

            // 2. Seconds: Default to 4, allowed: 4, 8, 12
            let seconds = "4";
            const validSeconds = ["4", "8", "12"];
            const durationStr = String(duration);
            if (validSeconds.includes(durationStr)) {
                seconds = durationStr;
            }

            // 3. Size: Default to 720x1280
            // Map common aspect ratios to allowed sizes if necessary, or pass through strict sizes
            // Allowed: 720x1280, 1280x720, 1024x1792, 1792x1024
            let size = "1280x720"; // Default to landscape
            const allowedSizes = ["720x1280", "1280x720", "1024x1792", "1792x1024"];

            // Logic to handle if frontend sends "16:9" or strict size
            const sizeMap = {
                "16:9": "1280x720",
                "9:16": "720x1280",
                "4:7": "1024x1792",
                "7:4": "1792x1024",
                // Also map the exact size strings to themselves for passthrough
                "1280x720": "1280x720",
                "720x1280": "720x1280",
                "1024x1792": "1024x1792",
                "1792x1024": "1792x1024"
            };

            // Try to map the aspect ratio
            if (allowedSizes.includes(aspectRatio)) {
                size = aspectRatio;
            } else if (sizeMap[aspectRatio]) {
                size = sizeMap[aspectRatio];
            } else {
                // Fallback: if unrecognized, default to landscape
                console.warn(`[CompetAPI] Invalid aspect ratio "${aspectRatio}", defaulting to 1280x720`);
                size = "1280x720";
            }

            // Final safety check
            if (!allowedSizes.includes(size)) {
                console.error(`[CompetAPI] Invalid size "${size}" after mapping, forcing to 1280x720`);
                size = "1280x720";
            }

            console.log(`[CompetAPI] Video generation - aspect ratio: ${aspectRatio} -> size: ${size}`);

            // Construct FormData with ONLY the 4 allowed fields
            const formData = new FormData();
            formData.append("prompt", prompt);
            formData.append("model", "sora-2"); // Hardcoded as requested
            formData.append("seconds", seconds);
            formData.append("size", size);

            // Convert to Buffer to avoid stream EOF or Length Mismatch errors
            // This is safe for small text requests and ensures headers are perfect
            const payloadBuffer = formData.getBuffer();

            // Prepare headers - form-data getHeaders() includes the boundary
            const headers = {
                "Authorization": `Bearer ${this.apiKey}`,
                ...formData.getHeaders(),
                "Content-Length": payloadBuffer.length
            };

            const submitResponse = await fetch(`${this.baseUrl}/videos`, {
                method: "POST",
                headers: headers,
                body: payloadBuffer,
            });

            if (!submitResponse.ok) {
                const errorText = await submitResponse.text();
                throw new Error(`CompetAPI submission failed: ${errorText}`);
            }

            const result = await submitResponse.json();

            // API return might just be { id: "..." } or payload text
            // User example shows console.log(result), implying text/json response.
            // Assuming standard flow returns an ID to poll.
            const videoId = result.id || result.data?.id;

            if (!videoId) {
                throw new Error(`No video ID found in response: ${JSON.stringify(result)}`);
            }

            // Step 2: Poll for completion
            const finalData = await this.pollVideoProgress(videoId);

            // Extract video URL
            let videoUrl = finalData?.url || finalData?.video_url || finalData?.output_url || finalData?.data?.video_url || finalData?.data?.url;

            // Fallback
            if (!videoUrl) {
                videoUrl = `${this.baseUrl}/videos/${videoId}/content`;
            }

            // Download
            let localPath = null;
            try {
                const relativePath = await this.downloadVideo(videoId, videoUrl);
                localPath = path.join(process.cwd(), "public", relativePath);
            } catch (downloadError) {
                console.error("[CompetAPI] Failed to auto-download video:", downloadError);
            }

            return {
                url: `/api/content/stream/video/${videoId}`,
                remoteUrl: videoUrl,
                localPath: localPath,
                modelUsed: model,
                generationId: videoId,
                format: "mp4"
            };

        } catch (error) {
            console.error("[CompetAPI] Video generation error:", error);
            throw error;
        }
    }

    /**
     * Generate Image-to-Video using Kling v1
     */
    /**
     * Generate Image-to-Video using Kling v1
     */
    async generateImageToVideo(imageUrl, prompt, duration, mode, cfg_scale = 0.5) {
        try {
            // Strict Parameter Enforcement for Kling API

            // 1. Image Processing: Ensure raw Base64 if data URI provided
            let processedImage = imageUrl;
            if (imageUrl && imageUrl.startsWith('data:')) {
                processedImage = imageUrl.split(',')[1];
            }

            // 2. Duration: Strictly "5" or "10" (defaults to "5")
            let validDuration = "5";
            if (String(duration) === "10") {
                validDuration = "10";
            }

            // 3. Mode: "std" or "pro" (defaults to "pro" as per user request example)
            // User example had "mode": "pro"
            let validMode = "pro";
            if (mode === "std") {
                validMode = "std";
            }

            // Construct JSON payload
            // Endpoint: .../kling/v1/videos/image2video
            // Content-Type: application/json
            const payload = {
                "model_name": "kling-v1",
                "mode": validMode,
                "duration": validDuration,
                "image": processedImage, // Base64 or URL
                "prompt": prompt || "Animate this image",
                "cfg_scale": Number(cfg_scale)
            };

            // Use direct URL as Kling endpoint structure differs from base v1
            const response = await fetch(`https://api.cometapi.com/kling/v1/videos/image2video`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`CompetAPI Kling submission failed: ${errorText}`);
            }

            const result = await response.json();

            // The result structure for Kling usually returns data.task_id or similar
            // User example log: console.log(result)
            // We assume standard CometAPI wrapping: { data: { task_id: ... } } or { id: ... }
            const taskId = result.data?.task_id || result.id || result.request_id;

            if (!taskId) {
                throw new Error(`No task_id found in Kling response: ${JSON.stringify(result)}`);
            }

            // Step 2: Poll for completion
            const finalData = await this.pollVideoProgress(taskId);

            // Extract video URL - handle various response shapes
            let videoUrl = finalData?.url || finalData?.video_url || finalData?.output_url;

            // Nested Kling specific checks
            if (!videoUrl && finalData?.data?.task_result?.videos?.length > 0) {
                videoUrl = finalData.data.task_result.videos[0].url;
            }
            if (!videoUrl && finalData?.videos?.length > 0) {
                videoUrl = finalData.videos[0].url;
            }

            // Fallback content URL
            if (!videoUrl) {
                videoUrl = `${this.baseUrl}/videos/${taskId}/content`;
            }

            // Download locally
            let localPath = null;
            try {
                const relativePath = await this.downloadVideo(taskId, videoUrl);
                localPath = path.join(process.cwd(), "public", relativePath);
            } catch (downloadError) {
                console.error("[CompetAPI] Failed to auto-download video:", downloadError);
            }

            return {
                url: `/api/content/stream/video/${taskId}`,
                remoteUrl: videoUrl,
                localPath: localPath,
                modelUsed: "kling-v1",
                generationId: taskId,
                format: "mp4"
            };

        } catch (error) {
            console.error("[CompetAPI] Image-to-Video error:", error);
            throw error;
        }
    }

    /**
     * Poll for video generation progress
     */
    async pollVideoProgress(videoId) {

        let attempts = 0;

        while (attempts < this.maxPollAttempts) {
            try {
                const statusResponse = await fetch(`${this.baseUrl}/videos/${videoId}`, {
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`
                    }
                });

                const text = await statusResponse.text();

                // Handle temporary server errors (HTML responses)
                if (text.startsWith("<")) {
                    await this.sleep(this.pollInterval);
                    attempts++;
                    continue;
                }

                const statusResult = JSON.parse(text);
                const data = statusResult.data || {};
                const progress = data.progress || "0%";
                // Check both 'status' and 'task_status' (Kling uses task_status)
                const status = data.status || data.task_status || "unknown";


                // Check for failure - THROW OUTSIDE CATCH to prevent retry
                if (status === "FAILURE" || status === "failed") {
                    const errorMsg = data.error?.message || data.task_status_msg || JSON.stringify(data);
                    throw new Error(`Video generation failed: ${errorMsg}`);
                }

                // Check for completion
                if (progress === "100%" || status === "completed" || status === "SUCCESS" || status === "succeed") {
                    return data;
                }

            } catch (parseError) {
                // Only retry if it's NOT a "Video generation failed" error
                if (parseError.message.includes("Video generation failed")) {
                    throw parseError; // Re-throw permanent failure
                }
            }

            await this.sleep(this.pollInterval);
            attempts++;
        }

        throw new Error("Video generation timeout - exceeded maximum poll attempts");
    }

    /**
     * Download video from CompetAPI
     */
    async downloadVideo(videoId, videoUrl) {
        try {

            // Create output directory if it doesn't exist
            const outputDir = path.join(process.cwd(), "public", "generated");
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Determine download URL
            const downloadUrl = videoUrl || `${this.baseUrl}/videos/${videoId}/content`;

            // Download video
            const videoResponse = await fetch(downloadUrl, {
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`
                }
            });

            if (!videoResponse.ok) {
                console.error(`[CompetAPI] Download failed with status: ${videoResponse.status} ${videoResponse.statusText}`);
                const errorText = await videoResponse.text();
                console.error(`[CompetAPI] Error body: ${errorText}`);
                throw new Error(`Failed to download video: ${videoResponse.statusText}`);
            }

            // Save to file
            const outputPath = path.join(outputDir, `${videoId}.mp4`);
            const arrayBuffer = await videoResponse.arrayBuffer();
            const videoBuffer = Buffer.from(arrayBuffer);
            fs.writeFileSync(outputPath, videoBuffer);

            if (fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);

                // Return relative URL for frontend
                return `/generated/${videoId}.mp4`;
            } else {
                throw new Error("Failed to save video file - file does not exist after write");
            }

        } catch (error) {
            console.error("[CompetAPI] Download error stack:", error);
            throw error;
        }
    }

    /**
     * Generate image edit using gpt-image-1 model
     */
    async generateImageEdit(imageUrl, prompt, modelId = "gpt-image-1", mask = null, quality = "auto", size = "auto", n = 1) {
        try {

            // Check if API key is valid
            if (!this.apiKey || this.apiKey.length < 10) {
                throw new Error('Invalid API key');
            }

            // Helper function to convert Base64 to Buffer
            const base64ToBuffer = (base64String) => {
                const base64Data = base64String.includes(',')
                    ? base64String.split(',')[1]
                    : base64String;
                return Buffer.from(base64Data, 'base64');
            };

            // Convert image to buffer
            const imageBuffer = base64ToBuffer(imageUrl);

            // Create FormData - try different approaches
            let FormDataModule;
            try {
                FormDataModule = (await import('form-data')).default;
            } catch (error) {
                FormDataModule = globalThis.FormData;
            }

            const formdata = new FormDataModule();

            // Try different approaches - first approach
            formdata.append("image", imageBuffer, "test.png");
            formdata.append("prompt", prompt);
            formdata.append("model", "gpt-image-1");

            // For mask, try empty string first
            formdata.append("mask", "");

            formdata.append("n", "");
            formdata.append("quality", "");
            formdata.append("response_format", "");
            formdata.append("size", "");

            // HARDCODED URL - try alternatives
            const apiUrls = [
                "https://api.cometapi.com/v1/images/edits",
                "https://api.competapi.com/v1/images/edits", // Note: competapi vs cometapi
                `${this.baseUrl}/images/edits`,
                "https://api.openai.com/v1/images/edits" // If it's OpenAI compatible
            ];

            const apiUrl = apiUrls[0]; // Start with first

            // Create headers
            const headers = {
                'Authorization': `Bearer ${this.apiKey}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            };

            // Add form-data headers if available
            if (formdata.getHeaders) {
                Object.assign(headers, formdata.getHeaders());
            }

            // Try with axios first
            let response;
            try {
                response = await axios.post(
                    apiUrl,
                    formdata,
                    {
                        headers: headers,
                        timeout: 60000, // 60 seconds
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity,
                        validateStatus: function (status) {
                            return status < 500; // Resolve only if status < 500
                        }
                    }
                );
            } catch (axiosError) {

                // Try with native fetch (Node.js 18+)
                if (globalThis.fetch) {
                    try {
                        // Convert to Blob for fetch
                        const imageBlob = new Blob([imageBuffer], { type: 'image/png' });
                        const fetchFormData = new FormData();

                        fetchFormData.append("image", imageBlob, "test.png");
                        fetchFormData.append("prompt", prompt);
                        fetchFormData.append("model", "gpt-image-1");
                        fetchFormData.append("mask", "");
                        fetchFormData.append("n", "");
                        fetchFormData.append("quality", "");
                        fetchFormData.append("response_format", "");
                        fetchFormData.append("size", "");

                        const fetchResponse = await fetch(apiUrl, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${this.apiKey}`
                            },
                            body: fetchFormData,
                            signal: AbortSignal.timeout(60000)
                        });

                        if (!fetchResponse.ok) {
                            throw new Error(`Fetch error: ${fetchResponse.status} ${fetchResponse.statusText}`);
                        }

                        const result = await fetchResponse.json();

                        // Process result...
                        const b64Image = result.data?.[0]?.b64_json;
                        if (!b64Image) {
                            throw new Error('No image data in response');
                        }

                        // Save image
                        const imageId = `edit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                        const outputDir = path.join(process.cwd(), "public", "generated");
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true });
                        }

                        const outputPath = path.join(outputDir, `${imageId}.png`);
                        const savedImageBuffer = Buffer.from(b64Image, 'base64');
                        fs.writeFileSync(outputPath, savedImageBuffer);

                        return {
                            url: `/api/content/stream/image/${imageId}`,
                            localPath: outputPath,
                            modelUsed: "gpt-image-1",
                            generationId: imageId,
                            format: "png"
                        };

                    } catch (fetchError) {
                        console.error('[CompetAPI] Fetch also failed:', fetchError.message);
                        throw fetchError;
                    }
                }

                throw axiosError;
            }

            // Check response
            if (response.status === 404) {
                console.error('[CompetAPI] 404 Error - Endpoint not found');
                console.error('[CompetAPI] Response headers:', response.headers);
                console.error('[CompetAPI] Response data:', response.data);

                // Try alternative endpoints
                for (let i = 1; i < apiUrls.length; i++) {
                    try {
                        const altResponse = await axios.post(
                            apiUrls[i],
                            formdata,
                            {
                                headers: headers,
                                timeout: 30000
                            }
                        );

                        if (altResponse.status === 200) {
                            response = altResponse;
                            break;
                        }
                    } catch (altError) {
                    }
                }
            }

            const result = response.data;

            if (response.status !== 200) {
                console.error('[CompetAPI] API Error:', result);
                throw new Error(`API returned ${response.status}: ${JSON.stringify(result)}`);
            }

            // Extract b64_json from response
            const b64Image = result.data?.[0]?.b64_json;
            if (!b64Image) {
                console.error('[CompetAPI] No image data in response:', result);
                throw new Error('No image data in response');
            }

            // Generate unique ID for this image
            const imageId = `edit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Save image locally
            const outputDir = path.join(process.cwd(), "public", "generated");
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const outputPath = path.join(outputDir, `${imageId}.png`);
            const savedImageBuffer = Buffer.from(b64Image, 'base64');
            fs.writeFileSync(outputPath, savedImageBuffer);


            return {
                url: `/api/content/stream/image/${imageId}`,
                localPath: outputPath,
                modelUsed: "gpt-image-1",
                generationId: imageId,
                format: "png"
            };

        } catch (error) {
            console.error("[CompetAPI] Image edit error details:");
            console.error("Error name:", error.name);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            console.error("Stack trace:", error.stack);

            if (error.response) {
                console.error("Response status:", error.response.status);
                console.error("Response headers:", error.response.headers);
                console.error("Response data:", error.response.data);
            }

            // Provide helpful error message
            const helpfulError = new Error(`Image edit failed: ${error.message}. Please check: 1) API key validity, 2) Endpoint URL, 3) Network connectivity.`);
            helpfulError.originalError = error;
            throw helpfulError;
        }
    }
    /**
     * Enhance a prompt using LLM
     */
    async enhancePrompt(originalPrompt) {
        try {

            // Use a cheaper/faster model for prompt enhancement
            const model = "gpt-4o-mini";

            const response = await axios.post(`${this.baseUrl}/chat/completions`, {
                model: model,
                messages: [
                    {
                        role: "system",
                        content: "You are an expert prompt engineer for AI image generation. Your task is to take a simple user prompt and enhance it with descriptive details, artistic style, lighting, and mood to create a high-quality image generation prompt. Keep the enhanced prompt under 1000 characters. Do not add any conversational text, just output the enhanced prompt."
                    },
                    {
                        role: "user",
                        content: `Enhance this prompt: "${originalPrompt}"`
                    }
                ],
                max_tokens: 300
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.choices && response.data.choices.length > 0) {
                const enhancedPrompt = response.data.choices[0].message.content.trim();
                return enhancedPrompt;
            }

            throw new Error("No completion found in response");

        } catch (error) {
            console.error("[CompetAPI] Prompt enhancement failed:", error.message);
            // Fallback to original prompt if enhancement fails
            return originalPrompt;
        }
    }

    /**
     * Generate prompt ideas
     */
    async generatePromptIdeas(params) {
        try {
            const { context = "text-to-video", userInput = "", count = 4, style } = params;

            const model = "gpt-4o-mini";
            const systemPrompt = `You are a creative AI assistant. Generate ${count} diverse and detailed prompt ideas for ${context} generation based on the user's concept. Each idea must be distinct. Return ONLY the list of prompts, one per line, with no numbering, bullets, or extra text.`;
            const userPrompt = userInput ? `Concept: "${userInput}"` : "Generate random creative concepts.";

            const response = await axios.post(`${this.baseUrl}/chat/completions`, {
                model: model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                max_tokens: 500,
                temperature: 0.8
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data?.choices?.[0]?.message?.content) {
                // Split by newline and filter empty lines
                const rawContent = response.data.choices[0].message.content;
                const prompts = rawContent.split('\n').filter(line => line.trim().length > 0);

                return {
                    success: true,
                    prompts: prompts.slice(0, count)
                };
            }

            throw new Error("No ideas generated");

        } catch (error) {
            console.error("[CompetAPI] Generate ideas failed:", error.message);
            throw error;
        }
    }

    /**
     * Generate image using CompetAPI (Strict Text-to-Image)
     */
    async generateImage(prompt, modelId, aspectRatio, existingImage) {
        try {
            // Strict Model Enforcement
            const validModels = ["dall-e-3", "gpt-image-1", "gpt-image-1-mini", "flux-kontext-max", "flux-kontext-pro", "qwen-image"];
            const model = validModels.includes(modelId) ? modelId : "dall-e-3";

            // Strict Size Enforcement
            // User docs say: 256x256, 512x512, 1024x1024. Default to 1024x1024.
            const validSizes = ["256x256", "512x512", "1024x1024"];
            let size = "1024x1024";

            // Map aspect ratios if passed, otherwise default
            if (aspectRatio === "1:1") size = "1024x1024";
            else if (aspectRatio === "Square") size = "1024x1024";

            // Construct strictly defined JSON payload
            const raw = JSON.stringify({
                "model": model,
                "size": size,
                "n": 1,
                "prompt": prompt
                // "image": existingImage ? [existingImage] : undefined // User's doc showed image array for edits, but this is generateImage. 
                // However, user example showed "image": [".jpg"]. I will omit 'image' for pure text-to-image unless it's needed.
                // The provided example was:
                // { "model": "gpt-image-1.5", "size": "1024x1024", "n": 1, "prompt": "fire up", "image": [".jpg"] }
                // But typically T2I doesn't take an image. I'll stick to prompt/model/size/n for T2I.
            });

            const requestOptions = {
                method: 'POST',
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json"
                },
                body: raw,
                redirect: 'follow'
            };

            const response = await fetch(`${this.baseUrl}/images/generations`, requestOptions);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`CompetAPI Error (${response.status}): ${errorText}`);
            }

            const result = await response.json();

            // Extract data
            // Expecting result.data[0].url or result.data[0].b64_json
            if (result.data && result.data.length > 0) {
                const imageItem = result.data[0];
                let remoteUrl = imageItem.url;
                let b64Data = imageItem.b64_json;

                // If we got b64_json, let's save it (similar to previous logic)
                // If we got url, we can use it directly

                let generationId = `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                if (b64Data) {
                    const imageBuffer = Buffer.from(b64Data, 'base64');
                    // We'll rely on the controller to handle saving or stream it if we return the right format
                    // But to be safe and consistent with previous code, let's return it struct
                    // Save image locally
                    const outputDir = path.join(process.cwd(), "public", "generated");
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }
                    const outputPath = path.join(outputDir, `${generationId}.png`);
                    fs.writeFileSync(outputPath, imageBuffer);

                    return {
                        url: `/api/content/stream/image/${generationId}`,
                        remoteUrl: null,
                        localPath: outputPath,
                        modelUsed: model,
                        generationId: generationId,
                        format: "png"
                    };

                } else if (remoteUrl) {
                    return {
                        url: remoteUrl, // Use remote URL directly if provided
                        remoteUrl: remoteUrl,
                        modelUsed: model,
                        generationId: generationId,
                        format: "png" // Assume png
                    };
                }
            }

            throw new Error("No image data found in response");

        } catch (error) {
            console.error(`[CompetAPI] Generate Image Error:`, error);
            throw error;
        }
    }



    /**
     * Poll for image generation progress
     */
    async pollImageProgress(imageId) {

        let attempts = 0;

        while (attempts < this.maxPollAttempts) {
            try {
                const statusResponse = await fetch(`${this.baseUrl}/images/${imageId}`, {
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`
                    }
                });

                const text = await statusResponse.text();

                if (text.startsWith("<")) {
                    await this.sleep(this.pollInterval);
                    attempts++;
                    continue;
                }

                const statusResult = JSON.parse(text);
                const data = statusResult.data || {};
                const progress = data.progress || "0%";
                const status = data.status || "unknown";


                if (status === "FAILURE" || status === "failed") {
                    throw new Error(`Image generation failed: ${JSON.stringify(data)}`);
                }

                if (progress === "100%" || status === "completed" || status === "SUCCESS") {
                    return true;
                }

            } catch (parseError) {
            }

            await this.sleep(this.pollInterval);
            attempts++;
        }

        throw new Error("Image generation timeout");
    }

    /**
     * Download image from CompetAPI
     */
    async downloadImage(imageId, directUrl = null) {
        try {

            const outputDir = path.join(process.cwd(), "public", "generated");
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const downloadUrl = directUrl || `${this.baseUrl}/images/${imageId}/content`;

            const imageResponse = await fetch(downloadUrl, {
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`
                }
            });

            if (!imageResponse.ok) {
                throw new Error(`Failed to download image: ${imageResponse.statusText}`);
            }

            const outputPath = path.join(outputDir, `${imageId}.png`);
            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
            fs.writeFileSync(outputPath, imageBuffer);

            if (fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                return `/generated/${imageId}.png`;
            } else {
                throw new Error("Failed to save image file");
            }

        } catch (error) {
            console.error("[CompetAPI] Download error:", error);
            throw error;
        }
    }

    /**
     * Check generation status
     */
    async checkStatus(generationId, type = "video") {
        try {
            const endpoint = type === "video" ? "videos" : "images";
            const response = await fetch(`${this.baseUrl}/${endpoint}/${generationId}`, {
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`
                }
            });

            const text = await response.text();
            if (text.startsWith("<")) {
                return { status: "processing", progress: "unknown" };
            }

            const result = JSON.parse(text);
            const data = result.data || {};

            return {
                status: data.status || "unknown",
                progress: data.progress || "0%",
                url: data.video_url || data.image_url,
                error: data.error
            };

        } catch (error) {
            console.error("[CompetAPI] Status check error:", error);
            throw error;
        }
    }

    /**
     * Get available models (not implemented by API, returning static list)
     */
    async getModels() {
        return {
            video: ["sora-2", "veo3.1", "runway-gen4", "kling-2.0", "luma"],
            image: ["gpt-image-1.5", "midjourney", "flux", "wanx-2.2-plus-img"]
        };
    }

    /**
     * Test API connectivity
     */
    async testConnection() {
        try {
            // Simple test by checking videos endpoint
            const response = await fetch(`${this.baseUrl}/videos`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`
                }
            });
            return response.ok;
        } catch (error) {
            console.error("Connection test failed:", error);
            return false;
        }
    }

    /**
     * Enhance prompt with style descriptors
     */
    _enhancePrompt(basePrompt, style, type) {
        if (!basePrompt && type === "imageToVideo") {
            basePrompt = "High quality animation, bringing the image to life";
        }

        const base = basePrompt || "";
        let suffix = "";

        // Quality boosters (Universal)
        const qualityKeywords = "8k resolution, cinematic lighting, high fidelity, sharp details, professional color grading";

        // Style Mappings
        const styles = {
            "cinematic": ", dramatic atmosphere, movie scene, wide angle, depth of field, anamorphic lens flares, film grain",
            "animated": ", stylized 3d animation, pixar style, vibrant colors, expressive motion, smooth rendering",
            "realistic": ", photorealistic, hyper-realistic, documentary style, natural lighting, 4k raw footage",
            "artistic": ", painterly style, oil painting, brush strokes, artistic composition, masterpiece, detailed",
            "dynamic": ", fast paced, motion blur, dynamic camera movements, action packed, high energy",
            "cyberpunk": ", neon lights, futuristic city, rain, reflections, high contrast, tech noir",
            "fantasy": ", magical atmosphere, ethereal lighting, dreamlike, soft focus, mystical particles",
            "anime": ", anime style, cel shaded, vibrant, 2d animation aesthetics, studio ghibli inspired",
            "3dRender": ", octane render, unreal engine 5, ray tracing, global illumination, highly detailed 3d model"
        };

        if (style && styles[style]) {
            suffix += styles[style];
        }

        // Add quality keywords if they aren't already implicitly covered
        if (!suffix.includes("film grain") && !suffix.includes("2d")) {
            suffix += `, ${qualityKeywords}`;
        }

        // Clean up
        return `${base}${suffix}`.replace(/,\s*,/g, ",").trim();
    }
}

export default CompetAPIProvider;
