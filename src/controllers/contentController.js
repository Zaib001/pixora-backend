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
            const defaultModelId = type === "image" ? "gpt-image-1.5" : "sora-2";

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

        // --- 4. Real AI Content Generation ---
        const config = await AIConfig.findOne({ configKey: "global" });
        let generationStartTime = Date.now();

        if (config) {
        }

        const useMockMode = !config || config.features.enableMockMode;

        if (useMockMode || !selectedModel) {
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

            const MOCK_VIDEOS = [
                "https://assets.mixkit.co/videos/preview/mixkit-waves-coming-to-the-beach-5016-large.mp4",
                "https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-1610-large.mp4",
                "https://assets.mixkit.co/videos/preview/mixkit-white-clouds-in-the-blue-sky-1428-large.mp4",
                "https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4"
            ];

            const MOCK_IMAGES = [
                "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1974&auto=format&fit=crop",
                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=2864&auto=format&fit=crop",
                "https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=3270&auto=format&fit=crop",
                "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=2940&auto=format&fit=crop"
            ];

            if (type === "video") {
                resultUrl = MOCK_VIDEOS[Math.floor(Math.random() * MOCK_VIDEOS.length)];
                thumbnailUrl = "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=1000&auto=format&fit=crop";
                generationId = `mock-video-${Date.now()}`;
            } else {
                resultUrl = MOCK_IMAGES[Math.floor(Math.random() * MOCK_IMAGES.length)];
                thumbnailUrl = resultUrl;
                generationId = `mock-image-${Date.now()}`;
            }
        } else {
            const apiKey = config.getApiKey("competapi");

            if (!apiKey) {
                throw new Error("CompetAPI key not configured.");
            }

            const provider = new CompetAPIProvider(apiKey, {
                timeout: config.timeouts.requestTimeout,
                maxRetries: config.features.maxRetries,
            });


            const generationResult = await provider.generate({
                model: modelId,
                prompt,
                type,
                aspectRatio,
                duration: type === "video" ? duration : undefined,
                style,
                imageUrl: req.body.imageUrl || req.body.image,
                cfg_scale: req.body.cfg_scale || req.body.cfgScale,
                // Image editing parameters
                mask: req.body.mask,
                quality: req.body.quality,
                size: req.body.size,
                n: req.body.n
            });


            // Extract data from generationResult
            generationId = generationResult.generationId || generationResult.id || generationResult.task_id || `gen-${Date.now()}`;

            // For videos, extract the actual remote URL (CompetAPI URL or local path)
            if (type === "video") {
                // Priority: remoteUrl (actual CompetAPI URL) > localPath > other URL fields
                if (generationResult.remoteUrl) {
                    remoteUrl = generationResult.remoteUrl;
                } else if (generationResult.localPath) {
                    remoteUrl = generationResult.localPath;
                } else if (generationResult.data?.result) {
                    remoteUrl = generationResult.data.result;
                } else if (generationResult.videoUrl) {
                    remoteUrl = generationResult.videoUrl;
                } else if (generationResult.data?.url) {
                    remoteUrl = generationResult.data.url;
                } else if (generationResult.url && !generationResult.url.includes('/api/content/stream')) {
                    // Only use generationResult.url if it's not a streaming endpoint
                    remoteUrl = generationResult.url;
                }


                // Create streaming URL for the video (this is what frontend will use)
                const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
                resultUrl = `${baseUrl}/api/content/stream/video/${generationId}`;

            } else if (type === "image" && generationResult.localPath) {
                // For locally saved images
                const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
                resultUrl = `${baseUrl}/api/content/stream/image/${generationId}`;
                remoteUrl = generationResult.localPath;
            } else {
                // Fallback for other types
                resultUrl = generationResult.url || generationResult.localUrl;
                remoteUrl = generationResult.remoteUrl || null;
            }

            thumbnailUrl = generationResult.thumbnailUrl || resultUrl;

            metadataFromProvider = {
                ...generationResult.metadata,
                ...generationResult.data,
                format: generationResult.format,
                modelUsed: generationResult.modelUsed,
                localPath: generationResult.localPath,
                task_id: generationResult.task_id,
                status: generationResult.status,
                progress: generationResult.progress
            };


            const generationTime = Math.floor((Date.now() - generationStartTime) / 1000);
            if (selectedModel) {
                await selectedModel.incrementGenerationStats(true, generationTime);
            }
        }

        // --- 5. Save Content Record ---
        const content = await Content.create({
            user: userId,
            type: type || "video",
            prompt: prompt,
            style: style || "realistic",
            url: resultUrl,
            remoteUrl: remoteUrl,
            thumbnailUrl: thumbnailUrl,
            status: "completed",
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
            generationId: generationId,
            metadata: {
                duration: type === 'video' ? duration : 0,
                aspectRatio: aspectRatio,
                localFilePath: metadataFromProvider.localPath,
                ...metadataFromProvider
            }
        });

        // Return with immediate preview if available
        let immediatePreview = null;
        if (type === "image" && metadataFromProvider.localPath && fs.existsSync(metadataFromProvider.localPath)) {
            try {
                const imageBuffer = fs.readFileSync(metadataFromProvider.localPath);
                immediatePreview = `data:image/png;base64,${imageBuffer.toString('base64')}`;
            } catch (previewError) {
                console.error("Failed to create immediate preview:", previewError);
            }
        }

        res.status(200).json({
            success: true,
            data: {
                ...content.toObject(),
                autoDownload: usedFreeGen,
                immediatePreview: immediatePreview
            },
            message: usedFreeGen
                ? `🎁 Free generation used! ${user.freeGenerationsLeft} free generation${user.freeGenerationsLeft !== 1 ? 's' : ''} remaining.`
                : `💎 ${cost} credit${cost > 1 ? 's' : ''} used! ${user.credits} credit${user.credits !== 1 ? 's' : ''} remaining.`,
            isFreeGeneration: usedFreeGen,
            creditsRemaining: user.credits,
            freeGenerationsLeft: user.freeGenerationsLeft,
            costUsed: cost
        });

    } catch (error) {
        console.error("Generate Content Error:", error);

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

                const wasFreeGeneration = user.freeGenerationsLeft < 3 && user.isFreeTierExhausted;

                if (wasFreeGeneration || (req.body.type && user.freeGenerationsLeft < 3)) {
                    await user.restoreFreeGeneration(`${req.body.type || 'content'} generation failed`);
                } else if (user.credits >= 0) {
                    await user.addCredits(cost, "refund", `${type} generation failed - refunded ${cost} credit${cost > 1 ? 's' : ''}`);
                }

                if (modelId) {
                    const selectedModel = await Model.findOne({ modelId });
                    if (selectedModel) {
                        await selectedModel.incrementGenerationStats(false, 0);
                    }
                }
            }
        } catch (restoreError) {
            console.error("Failed to restore credits/free generation:", restoreError);
        }

        res.status(500).json({
            success: false,
            message: "Failed to generate content.",
            error: error.message,
        });
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

        const debitTransactions = await Transaction.aggregate([
            { $match: { user: user._id, type: "debit" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const creditsUsed = debitTransactions[0]?.total || 0;
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
                    // Check Vercel /tmp directory
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

            // Get file stats
            const stats = fs.statSync(localPath);

            // SET CORS HEADERS FIRST
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range");
            res.setHeader("Content-Type", "image/png");
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

        // Fallback to remote URL if available
        if (content.remoteUrl) {

            const config = await AIConfig.findOne({ configKey: "global" });
            const apiKey = config ? config.getApiKey("competapi") : process.env.COMPETAPI_KEY;

            const response = await fetch(content.remoteUrl, {
                headers: {
                    "Authorization": `Bearer ${apiKey}`
                }
            });

            if (!response.ok) {
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
                return res.status(404).send("Upstream image not found");
            }

            // SET CORS HEADERS
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            res.setHeader("Content-Type", "image/png");
            res.setHeader("Cache-Control", "public, max-age=31536000");

            const { pipeline } = await import('stream/promises');
            const { Readable } = await import('stream');
            await pipeline(Readable.fromWeb(response.body), res);
            return;
        }

        // If no local file and no remote URL
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
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
        // Param extraction must match route definition: /stream/video/:videoId
        const id = req.params.videoId || req.params.id;
        if (!id) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            return res.status(400).send("Video ID is required");
        }

        // First try to find content by generationId
        let content = await Content.findOne({ generationId: id });

        if (!content) {
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
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            return res.status(404).send("Video not found");
        }


        // Check if we have a local file path
        let localPath = content.metadata?.localFilePath;

        if (!localPath) {
            const generatedPath = path.join(__dirname, '..', '..', 'public', 'generated');
            const possibleFilenames = [
                `${id}.mp4`,
                `${content.generationId}.mp4`,
                `${id}.mov`,
                `${content.generationId}.mov`
            ];

            for (const filename of possibleFilenames) {
                const testPath = path.join(generatedPath, filename);
                if (fs.existsSync(testPath)) {
                    localPath = testPath;
                    break;
                }
            }

            if (!localPath) {
                const publicPath = path.join(process.cwd(), 'public', 'generated');
                const possibleFilenames2 = [
                    `${id}.mp4`,
                    `${content.generationId}.mp4`,
                    `${id}.mov`,
                    `${content.generationId}.mov`
                ];

                for (const filename of possibleFilenames2) {
                    const testPath = path.join(publicPath, filename);
                    if (fs.existsSync(testPath)) {
                        localPath = testPath;
                        break;
                    }
                }

                if (!localPath) {
                    // Check Vercel /tmp directory
                    const tmpPath = path.join("/", "tmp", "generated");
                    for (const filename of possibleFilenames2) {
                        const testPath = path.join(tmpPath, filename);
                        if (fs.existsSync(testPath)) {
                            localPath = testPath;
                            break;
                        }
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
                res.setHeader('Content-Disposition', `attachment; filename="pixora-video-${id}.mp4"`);
                res.setHeader('Content-Type', 'video/mp4');
                const readStream = fs.createReadStream(localPath);
                readStream.pipe(res);
                return;
            }

            const stats = fs.statSync(localPath);
            const fileSize = stats.size;
            const range = req.headers.range;

            if (range) {
                // Handle range requests for streaming
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunkSize = (end - start) + 1;

                // Set all headers at once with writeHead
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': 'video/mp4',
                    'Access-Control-Allow-Origin': '*',
                    'Cross-Origin-Resource-Policy': 'cross-origin',
                    'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
                });

                const fileStream = fs.createReadStream(localPath, { start, end });
                fileStream.pipe(res);
            } else {
                // Full file request
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4',
                    'Access-Control-Allow-Origin': '*',
                    'Cross-Origin-Resource-Policy': 'cross-origin',
                });

                const fileStream = fs.createReadStream(localPath);
                fileStream.pipe(res);
            }
            return;
        }

        // Fallback to remote URL
        let remoteUrl = content.remoteUrl;

        if (!remoteUrl && content.url && content.url.startsWith('http') && !content.url.includes('/api/content/stream/')) {
            remoteUrl = content.url;
        }

        if (!remoteUrl) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            return res.status(404).send("Video not found or link expired");
        }


        const config = await AIConfig.findOne({ configKey: "global" });
        const apiKey = config ? config.getApiKey("competapi") : process.env.COMPETAPI_KEY;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetch(remoteUrl, {
                headers: {
                    "Authorization": `Bearer ${apiKey}`
                },
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                console.error(`Upstream video fetch failed: ${response.status} ${response.statusText}`);
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
                return res.status(404).send("Upstream video not found");
            }

            // SET CORS HEADERS BEFORE STREAMING
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            res.setHeader("Content-Type", "video/mp4");

            if (req.query.download === 'true') {
                res.setHeader('Content-Disposition', `attachment; filename="pixora-video-${id}.mp4"`);
            }

            const contentLength = response.headers.get("content-length");
            if (contentLength) {
                res.setHeader("Content-Length", contentLength);
            }

            const { pipeline } = await import('stream/promises');
            const { Readable } = await import('stream');

            await pipeline(Readable.fromWeb(response.body), res);

        } catch (fetchError) {
            clearTimeout(timeout);
            console.error("Fetch error for video streaming:", fetchError);
            if (!res.headersSent) {
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
                res.status(500).send("Failed to stream video from remote source");
            }
        }

    } catch (error) {
        console.error("Stream Video Error:", error);
        if (!res.headersSent) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            res.status(500).send("Streaming failed");
        }
    }
};

// @desc    Download Generated Image
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
