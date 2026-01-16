import User from "../models/User.js";
import Content from "../models/Content.js";
import Transaction from "../models/Transaction.js";
import Model from "../models/Model.js";
import AIConfig from "../models/AIConfig.js";
import CompetAPIProvider from "../utils/aiProviders/CompetAPIProvider.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Generate Content (Real AI Integration)
// @route   POST /api/content/generate
// @access  Private
export const generateContent = async (req, res) => {
    let remoteUrl = null;
    let generationId = null;
    let metadataFromProvider = {};

    try {
        let { type, prompt, style, model: modelId, aspectRatio = "16:9", duration = 5 } = req.body;
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        // --- 1. Get Model Configuration ---
        let selectedModel = null;
        let cost = 0;
        let resultUrl = "";
        let thumbnailUrl = "";

        if (modelId) {
            selectedModel = await Model.findOne({ modelId, type, status: { $in: ["active", "beta"] } });

            if (!selectedModel) {
                return res.status(404).json({
                    success: false,
                    message: `Model ${modelId} not found or not active.`,
                });
            }

            if (type === "video") {
                cost = Math.ceil(selectedModel.pricing.costPerSecond * duration);
            } else {
                cost = selectedModel.pricing.costPerImage;
            }
        } else {
            const defaultModelId = type === "image" ? "dall-e-3" : "sora-2";

            selectedModel = await Model.findOne({
                modelId: defaultModelId,
                type,
                status: { $in: ["active", "beta"] }
            });

            if (selectedModel) {
                modelId = selectedModel.modelId;
                if (type === "video") {
                    cost = Math.ceil(selectedModel.pricing.costPerSecond * duration);
                } else {
                    cost = selectedModel.pricing.costPerImage;
                }
            } else {
                console.warn(`Default model ${defaultModelId} not found in DB`);
                cost = type === "video" ? 2 : 1;
            }
        }

        let isPublic = false;
        let isWatermarked = false;

        // --- 2. Check Free Tier FIRST, then Paid Credits ---
        let usedFreeGen = false;

        if (user.freeGenerationsLeft > 0) {
            usedFreeGen = true;
            isWatermarked = true;
        } else {
            if (user.credits < cost) {
                return res.status(403).json({
                    success: false,
                    message: `Insufficient credits. You need ${cost} credit${cost > 1 ? 's' : ''} to generate this ${type}.`,
                    requiresCredits: true,
                    cost: cost,
                    currentBalance: user.credits,
                    freeGenerationsLeft: user.freeGenerationsLeft
                });
            }
        }

        // --- 3. Deduct Credits / Free Count ---
        if (usedFreeGen) {
            await user.useFreeGeneration(`Generated ${type}`);
        } else {
            await user.useCredits(cost, `Generated ${type}: ${prompt.substring(0, 20)}...`);
        }

        // --- 4. Real AI Content Generation (Asynchronous) ---
        const config = await AIConfig.findOne({ configKey: "global" });
        const useMockMode = !config || config.features.enableMockMode;

        // Create initial content record
        const content = await Content.create({
            user: userId,
            type: type || "video",
            prompt: prompt,
            style: style || "realistic",
            status: "pending",
            progress: 0,
            isPublic: isPublic,
            isWatermarked: isWatermarked,
            usageCost: usedFreeGen ? 0 : cost,
            modelDetails: selectedModel ? {
                provider: selectedModel.provider,
                modelId: selectedModel.modelId,
            } : {
                provider: "mock",
                modelId: "mock",
            },
            metadata: {
                duration: type === 'video' ? duration : 0,
                aspectRatio: aspectRatio
            }
        });

        // Response URL base
        const host = req.get('host');
        const protocol = (host.includes('vercel.app') || req.headers['x-forwarded-proto'] === 'https') ? 'https' : req.protocol;
        const baseUrl = process.env.BACKEND_URL || `${protocol}://${host}`;

        // Initiate background generation
        processGenerationInBackground({
            contentId: content._id,
            userId,
            body: req.body,
            useMockMode,
            selectedModel,
            cost,
            usedFreeGen,
            baseUrl,
            config
        });

        return res.status(200).json({
            success: true,
            data: content,
            message: "Generation started. You can track progress in the dashboard.",
            isFreeGeneration: usedFreeGen,
            creditsRemaining: user.credits,
            freeGenerationsLeft: user.freeGenerationsLeft
        });

    } catch (error) {
        console.error("Generate Content Error:", error);

        // Refund logic (if record wasn't created yet or other error before background task)
        try {
            const user = await User.findById(req.user.id);
            if (user) {
                const { type, model: modelId, duration = 5 } = req.body;
                let cost = 0;
                if (modelId) {
                    const selectedModel = await Model.findOne({ modelId });
                    if (selectedModel) {
                        cost = type === "video"
                            ? Math.ceil(selectedModel.pricing.costPerSecond * duration)
                            : selectedModel.pricing.costPerImage;
                    }
                } else {
                    cost = type === "video" ? 2 : 1;
                }

                if (req.body.type && user.freeGenerationsLeft < 3) {
                    await user.restoreFreeGeneration(`${req.body.type || 'content'} generation failed`);
                } else if (user.credits >= 0) {
                    await user.addCredits(cost, "refund", `${type} generation failed - refunded ${cost} credit${cost > 1 ? 's' : ''}`);
                }
            }
        } catch (restoreError) {
            console.error("Failed to restore credits/free generation:", restoreError);
        }

        res.status(500).json({
            success: false,
            message: "Failed to initiate generation.",
            error: error.message,
        });
    }
};

/**
 * Background worker for content generation
 */
const processGenerationInBackground = async ({
    contentId,
    userId,
    body,
    useMockMode,
    selectedModel,
    cost,
    usedFreeGen,
    baseUrl,
    config
}) => {
    let remoteUrl = null;
    let generationId = null;
    let metadataFromProvider = {};
    let generationStartTime = Date.now();

    const { type, prompt, style, model: modelId, aspectRatio = "16:9", duration = 5 } = body;

    try {
        // Update status to processing
        await Content.findByIdAndUpdate(contentId, { status: "processing", progress: 5 });

        // Real generation logic
        if (!selectedModel) {
            throw new Error(`Model not found for ${type} generation.`);
        }

        const apiKey = config ? config.getApiKey("competapi") : null;
        if (!apiKey) throw new Error("CompetAPI key not configured.");

        const provider = new CompetAPIProvider(apiKey, {
            timeout: config.timeouts?.requestTimeout || 600000,
            maxRetries: config.features?.maxRetries || 2,
        });

        const generationResult = await provider.generate({
            model: modelId,
            prompt,
            type,
            aspectRatio,
            duration: type === "video" ? duration : undefined,
            style,
            imageUrl: body.imageUrl || body.image,
            cfg_scale: body.cfg_scale || body.cfgScale,
            mode: body.mode,
            mask: body.mask,
            quality: body.quality,
            size: body.size,
            n: body.n,
            // Progress callback
            onProgress: async (pData) => {
                await Content.findByIdAndUpdate(contentId, {
                    progress: Math.max(5, pData.progress),
                    'metadata.status': pData.status
                });
            }
        });

        generationId = generationResult.generationId || generationResult.id || generationResult.task_id || `gen-${Date.now()}`;
        // remoteUrl should specifically be the upstream external URL
        remoteUrl = generationResult.remoteUrl?.startsWith('http') ? generationResult.remoteUrl :
            (generationResult.url?.startsWith('http') && !generationResult.url.includes('/api/content/stream')) ? generationResult.url : null;
        metadataFromProvider = generationResult;


        // Final result URL
        let resultUrl = "";
        let thumbnailUrl = "";

        if (type === "video") {
            resultUrl = `${baseUrl}/api/content/stream/video/${generationId}`;
            // thumbnailUrl for video should always point to the stream/image endpoint or a real remote thumbnail
            thumbnailUrl = (metadataFromProvider.thumbnailUrl && metadataFromProvider.thumbnailUrl.startsWith('http'))
                ? metadataFromProvider.thumbnailUrl
                : `${baseUrl}/api/content/stream/image/${generationId}`;
        } else {
            resultUrl = `${baseUrl}/api/content/stream/image/${generationId}`;
            thumbnailUrl = resultUrl;
        }

        const generationTime = Math.floor((Date.now() - generationStartTime) / 1000);
        if (selectedModel) {
            await selectedModel.incrementGenerationStats(true, generationTime);
        }

        // Final DB Update
        await Content.findByIdAndUpdate(contentId, {
            status: "completed",
            progress: 100,
            url: resultUrl,
            remoteUrl: remoteUrl,
            thumbnailUrl: thumbnailUrl,
            generationId: generationId,
            metadata: {
                ...metadataFromProvider.metadata,
                ...metadataFromProvider.data,
                duration: type === 'video' ? duration : 0,
                aspectRatio: aspectRatio,
                localFilePath: metadataFromProvider.localPath,
                generationTime
            }
        });

    } catch (error) {
        console.error(`[Background Gen] Error for ${contentId}:`, error);

        // Update record as failed
        await Content.findByIdAndUpdate(contentId, {
            status: "failed",
            error: error.message
        });

        // Refund Credits
        try {
            const user = await User.findById(userId);
            if (user) {
                if (usedFreeGen) {
                    await user.restoreFreeGeneration(`${type} generation failed`);
                } else {
                    await user.addCredits(cost, "refund", `${type} generation failed - refunded ${cost} credits`);
                }
            }
        } catch (refundError) {
            console.error(`[Background Gen] Refund Failed for ${contentId}:`, refundError);
        }

        if (selectedModel) {
            await selectedModel.incrementGenerationStats(false, 0);
        }
    }
};

// @desc    Get Dashboard Stats
// @route   GET /api/content/dashboard-stats
// @access  Private
export const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const totalProjects = await Content.countDocuments({ user: userId });
        const recentProjects = await Content.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(3);

        // Calculate credits used from user's credit history
        // Sum the absolute value of all negative "usage" or "generation" entries
        const creditsUsed = user.creditHistory
            .filter(item => ["usage", "generation"].includes(item.type) && item.amount < 0)
            .reduce((acc, item) => acc + Math.abs(item.amount), 0);

        const timeSavedHours = totalProjects * 2;

        res.status(200).json({
            success: true,
            stats: {
                projectsCreated: totalProjects,
                creditsUsed: creditsUsed,
                timeSaved: `${timeSavedHours}h`
            },
            recentProjects,
            user: {
                credits: user.credits,
                freeGenerationsLeft: user.freeGenerationsLeft
            }
        });
    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch dashboard stats" });
    }
};

// @desc    Get Free Tier Status
// @route   GET /api/content/free-tier-status
// @access  Private
export const getFreeTierStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        res.status(200).json({
            success: true,
            data: {
                freeGenerationsLeft: user.freeGenerationsLeft,
                isFreeTierExhausted: user.isFreeTierExhausted,
                canGenerate: user.freeGenerationsLeft > 0 || user.credits > 0,
                credits: user.credits,
            },
        });
    } catch (error) {
        console.error("Get Free Tier Status Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch free tier status.",
        });
    }
};

// @desc    Get Content History
// @route   GET /api/content/history
// @access  Private
export const getContentHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 10 } = req.query;

        const content = await Content.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const count = await Content.countDocuments({ user: userId });

        res.status(200).json({
            success: true,
            data: {
                content,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                totalItems: count,
            },
        });
    } catch (error) {
        console.error("Get Content History Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch content history.",
        });
    }
};

// @desc    Get Community Content (Public)
// @route   GET /api/content/community
// @access  Public
export const getCommunityContent = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const content = await Content.find({ isPublic: true })
            .populate('user', 'name')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await Content.countDocuments({ isPublic: true });

        res.status(200).json({
            success: true,
            data: {
                content,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                total: count
            }
        });
    } catch (error) {
        console.error("Get Community Content Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch community content",
            error: error.message
        });
    }
};

// @desc    Stream Content
// @route   GET /api/content/stream/image/:id
// @access  Public
export const streamImage = async (req, res) => {
    try {
        // Param extraction must match route definition: /stream/image/:imageId
        const id = req.params.imageId || req.params.id;

        if (!id) {
            // SET CORS HEADERS BEFORE ERROR RESPONSE
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            return res.status(400).json({
                success: false,
                message: "Image ID is required"
            });
        }

        // First try to find content by generationId
        let content = await Content.findOne({ generationId: id });

        if (!content) {
            // Try alternative ID formats
            const query = { generationId: id };
            if (id.match(/^[0-9a-fA-F]{24}$/)) {
                query.$or = [
                    { generationId: id },
                    { _id: id }
                ];
                delete query.generationId;
            } else {
                query.$or = [
                    { generationId: id },
                    { url: { $regex: id } }
                ];
                delete query.generationId;
            }
            content = await Content.findOne(query);
        }

        if (!content) {
            // SET CORS HEADERS BEFORE ERROR RESPONSE
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            return res.status(404).json({
                success: false,
                message: "Image not found"
            });
        }

        // Check if we have a local file path
        let localPath = content.metadata?.localFilePath;

        if (!localPath) {
            const generatedPath = path.join(__dirname, '..', '..', 'public', 'generated');
            const possibleFilenames = [
                `${id}.png`,
                `${content.generationId}.png`,
                `${id}.jpg`,
                `${content.generationId}.jpg`,
                `${id}.jpeg`,
                `${content.generationId}.jpeg`,
                `${id}.webp`,
                `${content.generationId}.webp`,
                `${id.replace(/[^a-zA-Z0-9-]/g, '')}.png`
            ];

            for (const filename of possibleFilenames) {
                const testPath = path.join(generatedPath, filename);
                if (fs.existsSync(testPath)) {
                    localPath = testPath;
                    break;
                }
            }

            if (!localPath) {
                const publicPath = path.join(process.cwd(), 'public', 'generated', `${id}.png`);
                if (fs.existsSync(publicPath)) {
                    localPath = publicPath;
                } else {
                    const tmpPath = path.join("/", "tmp", "generated", `${id}.png`);
                    if (fs.existsSync(tmpPath)) {
                        localPath = tmpPath;
                    }
                }
            }

            // Self-heal: update DB with local path
            if (localPath && !content.metadata?.localFilePath) {
                try {
                    await Content.updateOne(
                        { _id: content._id },
                        { $set: { 'metadata.localFilePath': localPath } }
                    );
                } catch (dbError) {
                    console.error("Failed to update content record:", dbError);
                }
            }
        }

        if (localPath && fs.existsSync(localPath)) {

            // Check if this is a download request
            if (req.query.download === 'true') {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
                res.setHeader('Content-Disposition', `attachment; filename="pixora-image-${id}.png"`);
                res.setHeader('Content-Type', 'image/png');
                const readStream = fs.createReadStream(localPath);
                readStream.pipe(res);
                return;
            }

            // Get file stats
            const stats = fs.statSync(localPath);
            const ext = path.extname(localPath).toLowerCase();
            const contentType = ext === '.png' ? 'image/png' :
                ext === '.webp' ? 'image/webp' :
                    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                        'image/png';

            // SET CORS HEADERS FIRST
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range");
            res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Length", stats.size);
            res.setHeader("Cache-Control", "public, max-age=31536000");

            // Create read stream
            const readStream = fs.createReadStream(localPath);

            readStream.on('error', (error) => {
                console.error('Stream error:', error);
                if (!res.headersSent) {
                    res.setHeader("Access-Control-Allow-Origin", "*");
                    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
                    res.status(500).json({
                        success: false,
                        message: "Error streaming image"
                    });
                }
            });

            readStream.pipe(res);
            return;
        }

        // Fallback to remote URL if available or try to recover from provider
        if (content.remoteUrl || content.generationId) {
            console.log(`[Stream] Local file missing for ${id}, attempting remote fetch`);

            try {
                const config = await AIConfig.findOne({ configKey: "global" });
                const apiKey = config ? config.getApiKey("competapi") : process.env.COMPETAPI_KEY;

                // 1. Try stored remoteUrl first
                let response = null;
                let fetchUrl = content.remoteUrl;

                if (fetchUrl && fetchUrl.startsWith('http')) {
                    const fetchOptions = { headers: {} };
                    if (fetchUrl.includes('cometapi.com') || fetchUrl.includes('competapi.com')) {
                        fetchOptions.headers["Authorization"] = `Bearer ${apiKey}`;
                    }

                    try {
                        const tryResponse = await fetch(fetchUrl, fetchOptions);
                        if (tryResponse.ok) {
                            response = tryResponse;
                        } else {
                            console.warn(`[Stream] Stored remoteUrl failed (${tryResponse.status}), trying fallback...`);
                        }
                    } catch (e) {
                        console.warn(`[Stream] Fetch error on remoteUrl: ${e.message}`);
                    }
                }

                // 2. If failed, try direct provider endpoint (Self-Healing)
                if (!response && content.generationId) {
                    const fallbackUrl = `https://api.cometapi.com/v1/images/${content.generationId}/content`;
                    console.log(`[Stream] Attempting fallback to provider: ${fallbackUrl}`);

                    const fallbackResponse = await fetch(fallbackUrl, {
                        headers: { "Authorization": `Bearer ${apiKey}` }
                    });

                    if (fallbackResponse.ok) {
                        response = fallbackResponse;
                        // Optional: Update DB with new valid URL could be done here asynchronously
                    } else {
                        console.error(`[Stream] Fallback failed (${fallbackResponse.status})`);
                    }
                }

                if (!response) {
                    throw new Error("All remote fetch attempts failed");
                }

                // SET CORS HEADERS
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
                res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
                res.setHeader("Cache-Control", "public, max-age=31536000");

                if (req.query.download === 'true') {
                    res.setHeader('Content-Disposition', `attachment; filename="pixora-image-${id}.png"`);
                }

                const { pipeline } = await import('stream/promises');
                const { Readable } = await import('stream');
                await pipeline(Readable.fromWeb(response.body), res);
                return;

            } catch (fallbackError) {
                console.error("[Stream] Remote stream error:", fallbackError.message);
            }
        }

        // If no local file and no remote URL
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

        // If this is a video but no thumbnail found, use a professional SVG play-icon placeholder
        if (content.type === 'video') {
            const svg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="512" height="512" fill="#1A1A1A"/>
                <path d="M192 128L384 256L192 384V128Z" fill="#A855F7" fill-opacity="0.8"/>
                <text x="256" y="450" text-anchor="middle" fill="white" font-family="Arial" font-size="24" opacity="0.5">Video Generation</text>
            </svg>`;
            res.setHeader('Content-Type', 'image/svg+xml');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.send(svg);
        }

        return res.status(404).json({
            success: false,
            message: "Image file not found"
        });

    } catch (error) {
        console.error("Stream Image Error:", error);
        if (!res.headersSent) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            res.status(500).json({
                success: false,
                message: "Failed to stream image"
            });
        }
    }
};

// @desc    Stream Video
// @route   GET /api/content/stream/video/:id
// @access  Public
export const streamVideo = async (req, res) => {
    try {
        const id = req.params.videoId || req.params.id;
        if (!id) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            return res.status(400).send("Video ID is required");
        }

        // 1. Find Content
        let content = await Content.findOne({ generationId: id });
        if (!content) {
            const query = {
                $or: [
                    { generationId: id },
                    { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
                    { url: { $regex: id } }
                ].filter(Boolean)
            };
            content = await Content.findOne(query);
        }

        if (!content) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            return res.status(404).send("Video not found");
        }

        // 2. Resolve Local Path
        let localPath = content.metadata?.localFilePath;

        if (!localPath) {
            const pathsToSearch = [
                path.join(__dirname, '..', '..', 'public', 'generated'),
                path.join(process.cwd(), 'public', 'generated'),
                path.join("/", "tmp", "generated")
            ];

            const possibleFilenames = [
                `${id}.mp4`,
                `${content.generationId}.mp4`,
                `${id}.mov`,
                `${content.generationId}.mov`
            ];

            outerLoop: for (const searchDir of pathsToSearch) {
                for (const filename of possibleFilenames) {
                    const testPath = path.join(searchDir, filename);
                    if (fs.existsSync(testPath)) {
                        localPath = testPath;
                        break outerLoop;
                    }
                }
            }

            // Self-heal: update DB with local path if found
            if (localPath && !content.metadata?.localFilePath) {
                await Content.updateOne(
                    { _id: content._id },
                    { $set: { 'metadata.localFilePath': localPath } }
                ).catch(err => console.error("Self-heal failed:", err));
            }
        }

        // 3. Handle Streaming or Redirect
        if (localPath && fs.existsSync(localPath)) {
            // Handle Download
            if (req.query.download === 'true') {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
                res.setHeader('Content-Disposition', `attachment; filename="pixora-video-${id}.mp4"`);
                res.setHeader('Content-Type', 'video/mp4');
                return fs.createReadStream(localPath).pipe(res);
            }

            const stats = fs.statSync(localPath);
            const fileSize = stats.size;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunkSize = (end - start) + 1;

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': 'video/mp4',
                    'Access-Control-Allow-Origin': '*',
                    'Cross-Origin-Resource-Policy': 'cross-origin',
                    'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
                });

                return fs.createReadStream(localPath, { start, end }).pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4',
                    'Access-Control-Allow-Origin': '*',
                    'Cross-Origin-Resource-Policy': 'cross-origin',
                });
                return fs.createReadStream(localPath).pipe(res);
            }
        } else if (content.remoteUrl) {
            // FALLBACK: Proxy remote URL (with Range support)
            console.log(`[Stream] Local file missing for ${id}, proxying from ${content.remoteUrl}`);

            try {
                if (!content.remoteUrl.startsWith('http')) {
                    throw new Error(`Invalid remote URL: ${content.remoteUrl}`);
                }

                const config = await AIConfig.findOne({ configKey: "global" });
                const apiKey = config ? config.getApiKey("competapi") : process.env.COMPETAPI_KEY;

                const fetchOptions = {
                    headers: {}
                };

                // Forward Range header if present
                if (req.headers.range) {
                    fetchOptions.headers['Range'] = req.headers.range;
                }

                // Add Auth if needed
                if (content.remoteUrl.includes('cometapi.com') || content.remoteUrl.includes('competapi.com')) {
                    fetchOptions.headers["Authorization"] = `Bearer ${apiKey}`;
                }

                const response = await fetch(content.remoteUrl, fetchOptions);

                if (!response.ok) {
                    console.error(`[Stream] Upstream video fetch failed (${response.status}): ${content.remoteUrl}`);

                    // Allow CORS for the error response too
                    res.setHeader("Access-Control-Allow-Origin", "*");
                    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

                    if (response.status === 404) {
                        return res.status(404).send("Upstream video not found");
                    }
                    return res.status(response.status).send(`Upstream error: ${response.statusText}`);
                }

                // Forward important headers
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

                const headersToForward = [
                    'content-type',
                    'content-length',
                    'content-range',
                    'accept-ranges',
                    'cache-control',
                    'last-modified',
                    'etag'
                ];

                headersToForward.forEach(headerName => {
                    const headerValue = response.headers.get(headerName);
                    if (headerValue) {
                        res.setHeader(headerName, headerValue);
                    }
                });

                // Set status code (200 or 206)
                res.status(response.status);

                const { pipeline } = await import('stream/promises');
                const { Readable } = await import('stream');
                await pipeline(Readable.fromWeb(response.body), res);
                return;

            } catch (proxyError) {
                console.error(`[Stream] Proxy error for ${id}:`, proxyError);
                if (!res.headersSent) {
                    res.setHeader("Access-Control-Allow-Origin", "*");
                    res.status(500).send("Failed to stream remote video");
                }
            }
        } else {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            return res.status(404).send("Video file not found locally or remotely");
        }
    } catch (error) {
        console.error("Stream Video Error:", error);
        return res.status(500).send("Internal Server Error");
    }
};



// @desc    Download Image
// @route   GET /api/content/download/:id
// @access  Private
export const downloadImage = async (req, res) => {
    try {
        const { id } = req.params;
        const content = await Content.findOne({
            generationId: id,
            user: req.user.id
        });

        if (!content) {
            return res.status(404).json({
                success: false,
                message: "Image not found or access denied."
            });
        }

        let localPath = content.metadata?.localFilePath;

        if (!localPath) {
            // Try to find the file
            const generatedPath = path.join(process.cwd(), 'public', 'generated');
            const possibleFilenames = [
                `${id}.png`,
                `${content.generationId}.png`,
                `${id.replace(/[^a-zA-Z0-9-]/g, '')}.png`
            ];

            for (const filename of possibleFilenames) {
                const testPath = path.join(generatedPath, filename);
                if (fs.existsSync(testPath)) {
                    localPath = testPath;
                    break;
                }
            }

            if (!localPath) {
                localPath = path.join(process.cwd(), "public", "generated", `${id}.png`);
            }

            // Self-heal logic for downloads too
            if (localPath && fs.existsSync(localPath) && !content.metadata?.localFilePath) {
                await Content.updateOne(
                    { _id: content._id },
                    { $set: { 'metadata.localFilePath': localPath } }
                );
            }
        }

        if (!fs.existsSync(localPath)) {
            return res.status(404).json({
                success: false,
                message: "Image file not found."
            });
        }

        const filename = `pixora-${content.generationId}-${Date.now()}.png`;

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Access-Control-Allow-Origin', '*');

        const readStream = fs.createReadStream(localPath);
        readStream.pipe(res);

    } catch (error) {
        console.error("Download Image Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to download image."
        });
    }
};

// @desc    Get Image Preview (Base64 for immediate display)
// @route   GET /api/content/preview/:id
// @access  Private
export const getImagePreview = async (req, res) => {
    try {
        const { id } = req.params;
        const content = await Content.findOne({
            generationId: id,
            user: req.user.id
        });

        if (!content) {
            return res.status(404).json({
                success: false,
                message: "Image not found."
            });
        }

        let localPath = content.metadata?.localFilePath;

        if (!localPath) {
            // Try to find the file
            const generatedPath = path.join(__dirname, '..', '..', 'public', 'generated');
            const possibleFilenames = [
                `${id}.png`,
                `${content.generationId}.png`,
                `${id.replace(/[^a-zA-Z0-9-]/g, '')}.png`
            ];

            for (const filename of possibleFilenames) {
                const testPath = path.join(generatedPath, filename);
                if (fs.existsSync(testPath)) {
                    localPath = testPath;
                    break;
                }
            }

            if (!localPath) {
                localPath = path.join(process.cwd(), "public", "generated", `${id}.png`);
            }
        }

        if (!fs.existsSync(localPath)) {
            return res.status(404).json({
                success: false,
                message: "Image file not found."
            });
        }

        const imageBuffer = fs.readFileSync(localPath);
        const base64Image = imageBuffer.toString('base64');

        res.json({
            success: true,
            data: {
                base64: `data:image/png;base64,${base64Image}`,
                contentType: 'image/png',
                filename: `pixora-${id}.png`
            }
        });

    } catch (error) {
        console.error("Get Preview Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to get image preview."
        });
    }
};

// @desc    Enhance Prompt using AI
// @route   POST /api/content/enhance-prompt
// @access  Private
export const enhancePrompt = async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ message: "Prompt is required" });
        }

        // Get AI Configuration
        let config = await AIConfig.findOne({ configKey: "global" });

        // If not found, try to create or just use null
        let apiKey = null;

        if (config) {
            apiKey = config.getApiKey("competapi"); // Prefer CompetAPI for this utility
        }

        if (!apiKey) {
            // Check environment variable as fallback
            apiKey = process.env.COMPETAPI_KEY;
        }

        if (!apiKey) {
            // Fallback mock if no API key
            return res.json({
                originalPrompt: prompt,
                enhancedPrompt: `${prompt}, highly detailed, 8k resolution, cinematic lighting, photorealistic, trending on artstation, sharp focus, masterpiece`
            });
        }

        const provider = new CompetAPIProvider(apiKey);
        const enhancedPrompt = await provider.enhancePrompt(prompt);

        res.json({
            originalPrompt: prompt,
            enhancedPrompt: enhancedPrompt
        });

    } catch (error) {
        console.error("Enhance Prompt Error:", error);
        res.status(500).json({ message: "Failed to enhance prompt" });
    }
};

// @desc    Delete Content
// @route   DELETE /api/content/:id
// @access  Private
export const deleteContent = async (req, res) => {
    try {
        const contentId = req.params.id;
        const userId = req.user.id;

        // Find the content
        const content = await Content.findById(contentId);

        if (!content) {
            return res.status(404).json({
                success: false,
                message: "Content not found"
            });
        }

        // Verify ownership
        if (content.user.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "Not authorized to delete this content"
            });
        }

        // Delete the content from database
        await Content.findByIdAndDelete(contentId);

        // Optional: Clean up local files if they exist
        if (content.localPath && fs.existsSync(content.localPath)) {
            try {
                fs.unlinkSync(content.localPath);
            } catch (fileError) {
                console.error("Failed to delete local file:", fileError);
                // Continue even if file deletion fails
            }
        }

        res.json({
            success: true,
            message: "Content deleted successfully"
        });

    } catch (error) {
        console.error("Delete Content Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete content",
            error: error.message
        });
    }
};

// @desc    Get Content Status
// @route   GET /api/content/status/:id
// @access  Private
export const getContentStatus = async (req, res) => {
    try {
        const contentId = req.params.id;
        const userId = req.user.id;

        const content = await Content.findById(contentId);

        if (!content) {
            return res.status(404).json({
                success: false,
                message: "Content not found"
            });
        }

        // Verify ownership
        if (content.user.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "Not authorized to access this content"
            });
        }

        res.status(200).json({
            success: true,
            data: {
                id: content._id,
                status: content.status,
                progress: content.progress,
                url: content.url,
                thumbnailUrl: content.thumbnailUrl,
                error: content.error,
                type: content.type
            }
        });
    } catch (error) {
        console.error("Get Content Status Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch content status",
            error: error.message
        });
    }
};
