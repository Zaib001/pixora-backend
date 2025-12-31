import Template from '../models/Template.js';

// @desc    Create a new template
// @route   POST /api/templates
// @access  Private/Admin
export const createTemplate = async (req, res) => {
    try {
        const { title, description, thumbnailUrl, previewUrl, category, duration, credits, isPopular } = req.body;

        if (!title || !description || !thumbnailUrl || !previewUrl) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
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
            isPopular
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
