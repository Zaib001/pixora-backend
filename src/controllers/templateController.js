import Template from '../models/Template.js';

// @desc    Create a new template
// @route   POST /api/templates
// @access  Private/Admin
export const createTemplate = async (req, res) => {
    try {
        const {
            title,
            description,
            thumbnailUrl,
            previewUrl,
            category,
            duration,
            credits,
            isPopular,
            promptText,
            contentType,
            isActive
        } = req.body;

        if (!title || !description || !promptText || !contentType) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields (title, description, promptText, contentType)'
            });
        }

        const template = await Template.create({
            title,
            description,
            thumbnailUrl,
            previewUrl,
            category,
            duration,
            credits,
            isPopular,
            promptText,
            contentType,
            isActive: isActive !== undefined ? isActive : true
        });

        res.status(201).json({
            success: true,
            data: template,
            message: 'Template created successfully'
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

// @desc    Get all templates
// @route   GET /api/templates
// @access  Private/Public (depending on route config)
export const getTemplates = async (req, res) => {
    try {
        const { category, search } = req.query;

        let query = {};

        // If not admin, only show active templates
        // We can check user role if req.user exists (added by protect middleware)
        if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
            query.isActive = true;
        }

        if (category && category !== 'all') {
            query.category = category;
        }

        if (search) {
            query.title = { $regex: search, $options: 'i' };
        }

        const templates = await Template.find(query).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: templates.length,
            data: templates
        });
    } catch (error) {
        console.error('Get Templates Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch templates'
        });
    }
};

// @desc    Update a template
// @route   PATCH /api/templates/:id
// @access  Private/Admin
export const updateTemplate = async (req, res) => {
    try {
        let template = await Template.findById(req.params.id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }

        template = await Template.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: template,
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

// @desc    Delete a template
// @route   DELETE /api/templates/:id
// @access  Private/Admin
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
