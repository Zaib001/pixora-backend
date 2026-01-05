import Template from '../models/Template.js';

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
            duration,
            credits,
            isPopular,
            promptText,
            contentType,
            isActive,
            isPublic,
            tags
        } = req.body;

        // Validation
        if (!title || !description || !promptText || !contentType) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields (title, description, promptText, contentType)'
            });
        }

        // Ensure prompt text is meaningful
        if (promptText.length < 20) {
            return res.status(400).json({
                success: false,
                message: 'Prompt text must be at least 20 characters to properly affect AI generation'
            });
        }

        const templateData = {
            title,
            description,
            promptText,
            contentType,
            category: category || 'other',
            duration: duration || '',
            credits: credits || 1,
            isPopular: isPopular || false,
            isActive: isActive !== undefined ? isActive : true,
            isPublic: isPublic || false,
            isTested: false,
            qualityScore: 0,
            tags: tags || [],
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
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { promptText: { $regex: search, $options: 'i' } }
            ];
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
 * @desc    Update a template
 * @route   PATCH /api/templates/:id
 * @access  Private/Admin
 */
export const updateTemplate = async (req, res) => {
    try {
        const template = await Template.findById(req.params.id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        // If updating prompt text, reset testing status
        if (req.body.promptText && req.body.promptText !== template.promptText) {
            req.body.isTested = false;
            req.body.lastTestedAt = new Date();
        }

        req.body.updatedBy = req.user?._id;

        const updatedTemplate = await Template.findByIdAndUpdate(
            req.params.id,
            req.body,
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