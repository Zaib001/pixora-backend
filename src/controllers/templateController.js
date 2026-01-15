import Template from '../models/Template.js';
import Model from '../models/Model.js';
import path from 'path';
import { getFileUrl, deleteFile } from '../middleware/uploadMiddleware.js';

/**
 * @desc    Create a new template
 * @route   POST /api/templates
 * @access  Private/Admin
 */
export const createTemplate = async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            subcategory,
            generatorType,
            modelId,
            promptText,
            promptEditable,
            parameters,
            inputRequirements,
            duration,
            credits,
            isPopular,
            isActive,
            isPublic,
            tags
        } = req.body;

        // Validation - Required fields
        if (!title || !description || !promptText || !generatorType || !category || !modelId) {
            if (req.file) deleteFile(req.file.path);
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields: title, description, promptText, generatorType, category, modelId'
            });
        }

        // Validate preview file upload
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Preview file is required (MP4, WebM, or GIF)'
            });
        }

        // Ensure prompt text is meaningful
        if (promptText.length < 20) {
            deleteFile(req.file.path);
            return res.status(400).json({
                success: false,
                message: 'Prompt text must be at least 20 characters'
            });
        }

        // Validate model exists and matches category
        const model = await Model.findOne({ modelId: modelId, status: 'active' });
        if (!model) {
            deleteFile(req.file.path);
            return res.status(400).json({
                success: false,
                message: 'Invalid or inactive model ID'
            });
        }

        if (model.type !== category) {
            deleteFile(req.file.path);
            return res.status(400).json({
                success: false,
                message: `Model type (${model.type}) must match template category (${category})`
            });
        }

        // Determine preview type
        const ext = path.extname(req.file.filename).toLowerCase();
        const previewType = ext === '.gif' ? 'gif' : 'video';
        const previewUrl = getFileUrl(req.file.filename);

        // Parse JSON fields
        let parsedParameters = {};
        let parsedInputRequirements = { requiresImage: false, requiresVideo: false, maxUploads: 1 };
        let parsedTags = [];

        try {
            if (parameters) parsedParameters = typeof parameters === 'string' ? JSON.parse(parameters) : parameters;
            if (inputRequirements) parsedInputRequirements = typeof inputRequirements === 'string' ? JSON.parse(inputRequirements) : inputRequirements;
            if (tags) parsedTags = typeof tags === 'string' ? JSON.parse(tags) : (Array.isArray(tags) ? tags : []);
        } catch (parseError) {
            deleteFile(req.file.path);
            return res.status(400).json({
                success: false,
                message: 'Invalid JSON format for parameters, inputRequirements, or tags'
            });
        }

        const templateData = {
            title,
            description,
            promptText,
            generatorType,
            category,
            subcategory: subcategory || 'other',
            previewUrl,
            previewType,
            modelId,
            promptEditable: promptEditable !== undefined ? (promptEditable === 'true' || promptEditable === true) : true,
            parameters: parsedParameters,
            inputRequirements: parsedInputRequirements,
            duration: duration || '',
            credits: credits || 1,
            isPopular: isPopular === 'true' || isPopular === true || false,
            isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : true,
            isPublic: isPublic === 'true' || isPublic === true || false,
            isTested: false,
            qualityScore: 0,
            tags: parsedTags,
            createdBy: req.user?._id,
            lastTestedAt: new Date()
        };

        const template = await Template.create(templateData);

        res.status(201).json({
            success: true,
            data: template,
            message: 'Template created successfully. Please test it before making it public.'
        });
    } catch (error) {
        console.error('Create Template Error:', error);
        if (req.file) deleteFile(req.file.path);
        res.status(500).json({
            success: false,
            message: 'Failed to create template',
            error: error.message
        });
    }
};

/**
 * @desc    Get all templates (Admin view)
 * @route   GET /api/templates
 * @access  Private/Admin
 */
export const getTemplates = async (req, res) => {
    try {
        const {
            category,
            search,
            status,
            contentType,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            page = 1,
            limit = 20
        } = req.query;

        let query = {};

        // Search functionality
        // Search functionality
        if (search) {
            // Use text search for better performance if possible
            // Note: Requires text index on title, description, promptText
            query.$text = { $search: search };
        }

        // Filter by category
        if (category && category !== 'all') {
            query.category = category;
        }

        // Filter by content type
        if (contentType && contentType !== 'all') {
            query.contentType = contentType;
        }

        // Filter by status
        if (status) {
            switch (status) {
                case 'active':
                    query.isActive = true;
                    query.isPublic = true;
                    query.isTested = true;
                    break;
                case 'hidden':
                    query.isActive = true;
                    query.isPublic = false;
                    break;
                case 'disabled':
                    query.isActive = false;
                    break;
                case 'untested':
                    query.isTested = false;
                    break;
            }
        }

        // Sorting
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [templates, total] = await Promise.all([
            Template.find(query)
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .populate('createdBy', 'name email'),
            Template.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            data: templates,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get Templates Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch templates'
        });
    }
};

/**
 * @desc    Get public templates for users
 * @route   GET /api/templates/public
 * @access  Public
 */
export const getPublicTemplates = async (req, res) => {
    try {
        const { category, search } = req.query;

        let filters = {};

        if (category && category !== 'all') {
            filters.category = category;
        }

        if (search) {
            filters.$text = { $search: search };
        }

        const templates = await Template.getPublicTemplates(filters);

        res.status(200).json({
            success: true,
            count: templates.length,
            data: templates
        });
    } catch (error) {
        console.error('Get Public Templates Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch templates'
        });
    }
};

/**
 * @desc    Get template detail (full data for generator pre-fill)
 * @route   GET /api/templates/:id/detail
 * @access  Public
 */
export const getTemplateDetail = async (req, res) => {
    try {
        const template = await Template.findById(req.params.id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        // Only return active and public templates to non-admin users
        if (!template.isActive || !template.isPublic) {
            return res.status(403).json({
                success: false,
                message: 'Template is not available'
            });
        }

        res.status(200).json({
            success: true,
            data: template
        });
    } catch (error) {
        console.error('Get Template Detail Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch template details'
        });
    }
};


/**
 * @desc    Update a template
 * @route   PATCH /api/templates/:id
 * @access  Private/Admin
 */
export const updateTemplate = async (req, res) => {
    try {
        const template = await Template.findById(req.params.id);

        if (!template) {
            if (req.file) deleteFile(req.file.path);
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        // Parse JSON fields if they're strings
        let updateData = { ...req.body };

        if (updateData.parameters && typeof updateData.parameters === 'string') {
            try {
                updateData.parameters = JSON.parse(updateData.parameters);
            } catch (e) {
                if (req.file) deleteFile(req.file.path);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid JSON format for parameters'
                });
            }
        }

        if (updateData.inputRequirements && typeof updateData.inputRequirements === 'string') {
            try {
                updateData.inputRequirements = JSON.parse(updateData.inputRequirements);
            } catch (e) {
                if (req.file) deleteFile(req.file.path);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid JSON format for inputRequirements'
                });
            }
        }

        if (updateData.tags && typeof updateData.tags === 'string') {
            try {
                updateData.tags = JSON.parse(updateData.tags);
            } catch (e) {
                if (req.file) deleteFile(req.file.path);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid JSON format for tags'
                });
            }
        }

        // Handle boolean fields from form data
        if (updateData.promptEditable !== undefined) {
            updateData.promptEditable = updateData.promptEditable === 'true' || updateData.promptEditable === true;
        }
        if (updateData.isActive !== undefined) {
            updateData.isActive = updateData.isActive === 'true' || updateData.isActive === true;
        }
        if (updateData.isPublic !== undefined) {
            updateData.isPublic = updateData.isPublic === 'true' || updateData.isPublic === true;
        }
        if (updateData.isPopular !== undefined) {
            updateData.isPopular = updateData.isPopular === 'true' || updateData.isPopular === true;
        }

        // Handle preview file replacement
        if (req.file) {
            // Delete old preview file
            if (template.previewUrl) {
                const oldFilename = template.previewUrl.split('/').pop();
                const oldFilePath = path.join(__dirname, '../../public/uploads/templates', oldFilename);
                deleteFile(oldFilePath);
            }

            // Set new preview URL and type
            const ext = path.extname(req.file.filename).toLowerCase();
            updateData.previewType = ext === '.gif' ? 'gif' : 'video';
            updateData.previewUrl = getFileUrl(req.file.filename);
        }

        // If updating prompt text, reset testing status
        if (updateData.promptText && updateData.promptText !== template.promptText) {
            updateData.isTested = false;
            updateData.lastTestedAt = new Date();
        }

        // Validate model if changed
        if (updateData.modelId && updateData.modelId !== template.modelId) {
            const model = await Model.findOne({ modelId: updateData.modelId, status: 'active' });
            if (!model) {
                if (req.file) deleteFile(req.file.path);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or inactive model ID'
                });
            }

            // Validate model type matches category
            const category = updateData.category || template.category;
            if (model.type !== category) {
                if (req.file) deleteFile(req.file.path);
                return res.status(400).json({
                    success: false,
                    message: `Model type (${model.type}) must match template category (${category})`
                });
            }
        }

        updateData.updatedBy = req.user?._id;

        const updatedTemplate = await Template.findByIdAndUpdate(
            req.params.id,
            updateData,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            data: updatedTemplate,
            message: 'Template updated successfully'
        });
    } catch (error) {
        console.error('Update Template Error:', error);
        if (req.file) deleteFile(req.file.path);
        res.status(500).json({
            success: false,
            message: 'Failed to update template',
            error: error.message
        });
    }
};

/**
 * @desc    Delete a template
 * @route   DELETE /api/templates/:id
 * @access  Private/Admin
 */
export const deleteTemplate = async (req, res) => {
    try {
        const template = await Template.findById(req.params.id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        await template.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Template deleted successfully'
        });
    } catch (error) {
        console.error('Delete Template Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete template'
        });
    }
};

/**
 * @desc    Test a template (mark as tested with quality score)
 * @route   POST /api/templates/:id/test
 * @access  Private/Admin
 */
export const testTemplate = async (req, res) => {
    try {
        const { qualityScore } = req.body;

        if (qualityScore && (qualityScore < 0 || qualityScore > 10)) {
            return res.status(400).json({
                success: false,
                message: 'Quality score must be between 0 and 10'
            });
        }

        const template = await Template.findById(req.params.id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        await template.markAsTested(qualityScore || 5);

        res.status(200).json({
            success: true,
            message: 'Template marked as tested',
            data: template
        });
    } catch (error) {
        console.error('Test Template Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to test template'
        });
    }
};

/**
 * @desc    Toggle template status
 * @route   PATCH /api/templates/:id/toggle-status
 * @access  Private/Admin
 */
export const toggleTemplateStatus = async (req, res) => {
    try {
        const { action } = req.body; // 'activate', 'deactivate', 'publish', 'hide'

        const template = await Template.findById(req.params.id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        switch (action) {
            case 'activate':
                template.isActive = true;
                break;
            case 'deactivate':
                template.isActive = false;
                template.isPublic = false; // Also hide when deactivating
                break;
            case 'publish':
                if (!template.isTested) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cannot publish untested template'
                    });
                }
                template.isPublic = true;
                break;
            case 'hide':
                template.isPublic = false;
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid action'
                });
        }

        template.updatedBy = req.user?._id;
        await template.save();

        res.status(200).json({
            success: true,
            data: template,
            message: `Template ${action}d successfully`
        });
    } catch (error) {
        console.error('Toggle Status Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update template status'
        });
    }
};

/**
 * @desc    Use a template (increment usage count)
 * @route   POST /api/templates/:id/use
 * @access  Private
 */
export const useTemplate = async (req, res) => {
    try {
        const template = await Template.findById(req.params.id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        if (!template.isActive || !template.isPublic) {
            return res.status(403).json({
                success: false,
                message: 'Template is not available'
            });
        }

        await template.incrementUses();

        res.status(200).json({
            success: true,
            data: { prompt: template.promptText, contentType: template.contentType },
            message: 'Template ready to use'
        });
    } catch (error) {
        console.error('Use Template Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to use template'
        });
    }
};