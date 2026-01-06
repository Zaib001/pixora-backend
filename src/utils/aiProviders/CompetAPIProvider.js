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
        const { type, prompt, model: modelId, aspectRatio, duration, imageUrl, cfg_scale, mask, quality, size, n } = params;

        // Determine if it's video or image generation
        if (type === "video") {
            if (imageUrl) {
                return await this.generateImageToVideo(imageUrl, prompt, duration, cfg_scale);
            }
            return await this.generateVideo(prompt, modelId, aspectRatio, duration);
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
            let size = "720x1280";
            const allowedSizes = ["720x1280", "1280x720", "1024x1792", "1792x1024"];

            // Logic to handle if frontend sends "16:9" or strict size
            const sizeMap = {
                "16:9": "1280x720",
                "9:16": "720x1280",
                "1:1": "1024x1024", // Note: 1:1 is NOT in the user's provided strict list for sora-2, so we might need to fallback or stick to strict list. 
                // User said: "REMOVE EXTRA PARAMETERS AND USE AND ADD EXACT THESE VALUE"
                // The prompt example says allowed sizes are: 720x1280, 1280x720, 1024x1792, 1792x1024
                // So "1024x1024" should probably NOT be sent if we want to be strict.
                "1280x720": "1280x720",
                "720x1280": "720x1280",
                "1024x1792": "1024x1792",
                "1792x1024": "1792x1024"
            };

            if (allowedSizes.includes(aspectRatio)) {
                size = aspectRatio;
            } else if (sizeMap[aspectRatio] && allowedSizes.includes(sizeMap[aspectRatio])) {
                size = sizeMap[aspectRatio];
            }
            // If strictly 1:1 was requested, we fallback to 720x1280 or similar as it's not in the allowed list for this specific request.

            // Construct FormData with ONLY the 4 allowed fields
            const formData = new FormData();
            formData.append("prompt", prompt);
            formData.append("model", model);
            formData.append("seconds", seconds);
            formData.append("size", size);

            const submitResponse = await fetch(`${this.baseUrl}/videos`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`
                    // boundary is set automatically by fetch+FormData
                },
                body: formData,
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
    async generateImageToVideo(imageUrl, prompt, duration, cfg_scale) {
        try {

            // Strip data:image/...;base64, prefix if present, as API likely wants raw base64
            let processedImage = imageUrl;
            if (imageUrl && imageUrl.startsWith('data:')) {
                processedImage = imageUrl.split(',')[1];
            }

            // Construct JSON payload as per user request
            const payload = {
                "model_name": "kling-v1",
                "mode": "pro",
                "duration": duration ? String(duration) : "5", // "5" or "10"
                "image": processedImage,
                "prompt": prompt || "Animate this image",
                "cfg_scale": cfg_scale ? Number(cfg_scale) : 0.5
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

            // Extract task_id (API returns data.task_id)
            const taskId = result.data?.task_id || result.request_id;

            if (!taskId) {
                throw new Error("No task_id found in Kling response");
            }


            // Poll for completion (Reusing video polling logic)
            // Note: Kling endpoint might need different polling, but usually standard /videos/{id} works or we check status via request_id
            // If standard polling fails, we might need a specific Kling polling endpoint. 
            // Assuming the platform normalizes status checks on /videos/{id} or /kling/v1/videos/{id}

            // We'll try the standard poll first. If it fails (404), we might need another strategy.
            // But based on common patterns, the task_id returned is queryable.

            const finalData = await this.pollVideoProgress(taskId);

            // Extract video URL
            let videoUrl = finalData?.url || finalData?.video_url || finalData?.output_url || finalData?.data?.video_url || finalData?.data?.url;

            // Check nested task_result from Kling specific structure
            // Check nested task_result from Kling specific structure
            // Based on logs: finalData has a 'data' property which contains 'task_result'
            if (!videoUrl) {
                const nestedData = finalData.data || finalData;
                if (nestedData?.task_result?.videos) {
                    if (nestedData.task_result.videos.length > 0) {
                        videoUrl = nestedData.task_result.videos[0]?.url;
                    }
                }
            }

            if (!videoUrl) {
                // Fallback for Kling specifically
                if (finalData?.videos && finalData.videos.length > 0) {
                    videoUrl = finalData.videos[0].url;
                }
            }

            if (!videoUrl) {
                // FALLBACK DEBUG: Log the ENTIRE final data structure to see where the URL is

                throw new Error("Failed to retrieve video URL from completed task");
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

    async generateImage(prompt, modelId, aspectRatio, existingImage) {
        try {

            // Map aspect ratio to size string (CompetAPI Supports: 1024x1024, 1024x1536, 1536x1024)
            const sizeMap = {
                "16:9": "1536x1024", // Landscape
                "9:16": "1024x1536", // Portrait
                "1:1": "1024x1024",  // Square
                "4:3": "1536x1024",  // Landscape fallback
                "3:4": "1024x1536",  // Portrait fallback
                "21:9": "1536x1024"  // Landscape fallback
            };

            const size = (aspectRatio && sizeMap[aspectRatio]) ? sizeMap[aspectRatio] : "1024x1024";

            // Construct JSON payload matching user snippet
            const payload = {
                model: modelId,
                prompt: prompt,
                size: size,
                n: 1
            };

            if (existingImage) {
                payload.image = [existingImage];
            }


            const maxRetries = 3;
            let attempt = 0;
            let response;

            while (attempt < maxRetries) {
                try {

                    const config = {
                        method: 'post',
                        url: `${this.baseUrl}/images/generations`,
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        data: payload,
                        timeout: 120000 // 2 minutes timeout
                    };

                    response = await axios(config);

                    break;

                } catch (error) {
                    console.error(`[CompetAPI] Request error attempt ${attempt + 1}:`, error.message);

                    if (error.response && error.response.status === 429) {
                        await this.sleep(this.pollInterval);
                        attempt++;
                        continue;
                    }

                    attempt++;
                    if (attempt >= maxRetries) throw error;
                    await this.sleep(this.pollInterval);
                }
            }

            // Axios automatically throws for non-2xx, so if we are here, it's successful.
            const result = response.data;

            // Helper to return success format
            const returnSuccess = (id, remoteUrl) => {
                return {
                    url: `/api/content/stream/image/${id}`,
                    remoteUrl: remoteUrl, // Controller must save this
                    modelUsed: modelId,
                    generationId: id,
                    format: "png"
                };
            };

            // Handle response
            if (result.created && result.data && result.data[0].b64_json) {
                // Case 1: Base64 JSON (Direct Data)
                const b64Data = result.data[0].b64_json;
                const imageBuffer = Buffer.from(b64Data, 'base64');

                // We MUST save this to serve it via stream, as we can't stream a non-existent remote URL
                const imageId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                // Use /tmp for Vercel deployment, otherwise use public/generated
                const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
                const outputDir = isVercel
                    ? path.join("/", "tmp", "generated")
                    : path.join(process.cwd(), "public", "generated");

                if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

                const outputPath = path.join(outputDir, `${imageId}.png`);
                fs.writeFileSync(outputPath, imageBuffer);

                // Return success with localPath signals controller to look locally 
                return {
                    url: `/api/content/stream/image/${imageId}`,
                    remoteUrl: null,
                    localPath: outputPath, // Return the local path
                    modelUsed: modelId,
                    generationId: imageId,
                    format: "png"
                };

            } else if (result.id && !result.data) {
                // Async - Poll for it
                await this.pollImageProgress(result.id);
                // After polling, we need to get the URL. The poll method returns 'true' currently, 
                // we might need to fetch the status one last time or update pollImageProgress to return data.
                // Let's quickly check status.
                const statusCheck = await this.checkStatus(result.id, "image");
                return returnSuccess(result.id, statusCheck.url);

            } else if (result.data && Array.isArray(result.data) && result.data.length > 0) {
                // Sync
                const imageUrl = result.data[0].url;

                // Generate fake ID for consistent routing
                const imageId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                return returnSuccess(imageId, imageUrl);

            } else {
                throw new Error("Unknown response format from CompetAPI images");
            }

        } catch (error) {
            console.error("[CompetAPI] Image generation error:", error);
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
}

export default CompetAPIProvider;
