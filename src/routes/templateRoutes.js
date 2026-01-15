import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { uploadPreview, handleUploadError } from '../middleware/uploadMiddleware.js';
import {
    createTemplate,
    getTemplates,
    getPublicTemplates,
    getTemplateDetail,
    updateTemplate,
    deleteTemplate,
    testTemplate,
    toggleTemplateStatus,
    useTemplate
} from '../controllers/templateController.js';

const router = express.Router();

// Public routes (anyone can see available templates)
router.get('/public', getPublicTemplates);

// Get template detail (for generator pre-fill)
router.get('/:id/detail', getTemplateDetail);

// Protected routes (authenticated users can use templates)
router.post('/:id/use', protect, useTemplate);

// Admin routes (create, read, update, delete)
router.route('/')
    .get(protect, getTemplates)
    .post(protect, authorize('admin', 'superadmin'), uploadPreview, handleUploadError, createTemplate);

router.route('/:id')
    .patch(protect, authorize('admin', 'superadmin'), uploadPreview, handleUploadError, updateTemplate)
    .delete(protect, authorize('admin', 'superadmin'), deleteTemplate);

// Template management routes (admin only)
router.post('/:id/test', protect, authorize('admin', 'superadmin'), testTemplate);
router.patch('/:id/toggle-status', protect, authorize('admin', 'superadmin'), toggleTemplateStatus);

export default router;