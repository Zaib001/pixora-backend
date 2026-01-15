import Model from "../models/Model.js";
import AIConfig from "../models/AIConfig.js";
import CompetAPIProvider from "../utils/aiProviders/CompetAPIProvider.js";
import mongoose from "mongoose";

// @desc    Get all models with filters
// @route   GET /api/admin/models
// @access  Private/Admin
export const getAllModels = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            type,
            status,
            provider,
            sortBy = "displayOrder",
            sortOrder = "asc",
        } = req.query;

        const query = {};
        if (type) query.type = type;
        if (status) query.status = status;
        if (provider) query.provider = provider;

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

        const models = await Model.find(query)
            .sort(sortOptions)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const count = await Model.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                models,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                total: count,
            },
        });
    } catch (error) {
        console.error("Get All Models Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve models.",
            error: error.message,
        });
    }
};

// @desc    Get active models (for template creation)
// @route   GET /api/models/active
// @access  Public
export const getActiveModels = async (req, res) => {
    try {
        const { type } = req.query; // 'image' or 'video'

        const query = { status: 'active' };
        if (type) {
            query.type = type;
        }

        const models = await Model.find(query)
            .select('modelId name type description parameters specifications')
            .sort({ displayOrder: 1, name: 1 })
            .lean();

        res.status(200).json({
            success: true,
            data: models
        });
    } catch (error) {
        console.error('Get Active Models Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve active models.',
            error: error.message
        });
    }
};

// @desc    Create a new model
// @route   POST /api/admin/models
// @access  Private/SuperAdmin
export const createModel = async (req, res) => {
    try {
        const {
            modelId,
            name,
            provider,
            type,
            pricing,
            specifications,
            description,
            tags,
            isPopular,
            parameters,
        } = req.body;

        // Check if model already exists
        const existingModel = await Model.findOne({ modelId });
        if (existingModel) {
            return res.status(400).json({
                success: false,
                message: "Model with this ID already exists.",
            });
        }

        const model = await Model.create({
            modelId,
            name,
            provider,
            type,
            pricing,
            specifications,
            description,
            tags,
            isPopular,
            parameters: parameters || [],
            status: "active",
        });

        res.status(201).json({
            success: true,
            data: { model },
            message: "Model created successfully.",
        });
    } catch (error) {
        console.error("Create Model Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create model.",
            error: error.message,
        });
    }
};

// @desc    Update a model
// @route   PUT /api/admin/models/:id
// @access  Private/SuperAdmin
export const updateModel = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid model ID.",
            });
        }

        const model = await Model.findByIdAndUpdate(
            id,
            { $set: req.body },
            { new: true, runValidators: true }
        );

        if (!model) {
            return res.status(404).json({
                success: false,
                message: "Model not found.",
            });
        }

        res.status(200).json({
            success: true,
            data: { model },
            message: "Model updated successfully.",
        });
    } catch (error) {
        console.error("Update Model Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update model.",
            error: error.message,
        });
    }
};

// @desc    Delete a model
// @route   DELETE /api/admin/models/:id
// @access  Private/SuperAdmin
export const deleteModel = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid model ID.",
            });
        }

        const model = await Model.findByIdAndDelete(id);

        if (!model) {
            return res.status(404).json({
                success: false,
                message: "Model not found.",
            });
        }

        res.status(200).json({
            success: true,
            message: "Model deleted successfully.",
        });
    } catch (error) {
        console.error("Delete Model Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete model.",
            error: error.message,
        });
    }
};

// @desc    Toggle model status
// @route   PATCH /api/admin/models/:id/toggle
// @access  Private/Admin
export const toggleModelStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid model ID.",
            });
        }

        if (!["active", "beta", "inactive", "deprecated"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status value.",
            });
        }

        const model = await Model.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        );

        if (!model) {
            return res.status(404).json({
                success: false,
                message: "Model not found.",
            });
        }

        res.status(200).json({
            success: true,
            data: { model },
            message: `Model status updated to ${status}.`,
        });
    } catch (error) {
        console.error("Toggle Model Status Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update model status.",
            error: error.message,
        });
    }
};

// @desc    Save API keys and Integration settings (encrypted/global)
// @route   POST /api/admin/config/api-keys
// @access  Private/SuperAdmin
export const saveAPIKeys = async (req, res) => {
    try {
        const { competapi, openai, deepseek, rateLimits, timeouts, integrations, features } = req.body;

        let config = await AIConfig.findOne({ configKey: "global" });

        if (!config) {
            config = await AIConfig.create({ configKey: "global" });
        }

        // Set encrypted API keys
        if (competapi) config.setApiKey("competapi", competapi);
        if (openai) config.setApiKey("openai", openai);
        if (deepseek) config.setApiKey("deepseek", deepseek);

        // Update other settings
        if (rateLimits) {
            config.rateLimits = { ...config.rateLimits, ...rateLimits };
            config.markModified('rateLimits');
        }
        if (timeouts) {
            config.timeouts = { ...config.timeouts, ...timeouts };
            config.markModified('timeouts');
        }
        if (integrations) {
            config.integrations = {
                tidioEnabled: integrations.tidioEnabled,
                tidioScriptId: integrations.tidioScriptId || config.integrations?.tidioScriptId
            };
            config.markModified('integrations');
        }
        if (features) {
            config.features = { ...config.features, ...features };
            config.markModified('features');
        }

        await config.save();

        res.status(200).json({
            success: true,
            message: "Configuration saved successfully.",
            data: {
                maskedKeys: config.getMaskedKeys(),
                integrations: config.integrations,
                features: config.features
            },
        });
    } catch (error) {
        console.error("Save API Keys Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to save configuration.",
            error: error.message,
        });
    }
};

// @desc    Get public configuration (non-sensitive)
// @route   GET /api/config
// @access  Public
export const getPublicConfig = async (req, res) => {
    try {
        const config = await AIConfig.findOne({ configKey: "global" });
        console.log(`[getPublicConfig] Fetching global config. Found: ${!!config}`);

        if (!config) {
            console.log("[getPublicConfig] No global config found, returning defaults.");
            return res.status(200).json({
                success: true,
                data: {
                    integrations: {
                        tidioEnabled: true,
                        tidioScriptId: "hq4xyf3vsguzrmfqwys6kodan18zxbdk"
                    },
                    features: {
                        enableAIIdeas: true,
                        enableAsyncGeneration: true
                    }
                }
            });
        }

        console.log(`[getPublicConfig] Integrations:`, config.integrations);

        res.status(200).json({
            success: true,
            data: {
                integrations: config.integrations,
                features: {
                    enableAIIdeas: config.features?.enableAIIdeas,
                    enableAsyncGeneration: config.features?.enableAsyncGeneration
                }
            },
        });
    } catch (error) {
        console.error("Get Public Config Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve configuration.",
            error: error.message,
        });
    }
};

// @desc    Get API keys (masked)
// @route   GET /api/admin/config/api-keys
// @access  Private/Admin
export const getAPIKeys = async (req, res) => {
    try {
        const config = await AIConfig.findOne({ configKey: "global" });

        if (!config) {
            return res.status(200).json({
                success: true,
                data: {
                    maskedKeys: {},
                    rateLimits: {},
                    timeouts: {},
                    features: {},
                },
            });
        }

        res.status(200).json({
            success: true,
            data: {
                maskedKeys: config.getMaskedKeys(),
                rateLimits: config.rateLimits,
                timeouts: config.timeouts,
                features: config.features,
                integrations: config.integrations,
            },
        });
    } catch (error) {
        console.error("Get API Keys Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve API keys.",
            error: error.message,
        });
    }
};

// @desc    Test model connectivity
// @route   POST /api/admin/config/test-model
// @access  Private/Admin
export const testModel = async (req, res) => {
    try {
        const { provider = "competapi" } = req.body;

        const config = await AIConfig.findOne({ configKey: "global" });

        if (!config) {
            return res.status(400).json({
                success: false,
                message: "No API configuration found. Please set API keys first.",
            });
        }

        const apiKey = config.getApiKey(provider);

        if (!apiKey) {
            return res.status(400).json({
                success: false,
                message: `No API key found for provider: ${provider}`,
            });
        }

        // Test connection based on provider
        let connectionSuccessful = false;

        if (provider === "competapi") {
            const competAPIProvider = new CompetAPIProvider(apiKey);
            connectionSuccessful = await competAPIProvider.testConnection();
        }

        res.status(200).json({
            success: true,
            connected: connectionSuccessful,
            message: connectionSuccessful
                ? `Successfully connected to ${provider}`
                : `Failed to connect to ${provider}`,
        });
    } catch (error) {
        console.error("Test Model Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to test model connectivity.",
            error: error.message,
        });
    }
};
