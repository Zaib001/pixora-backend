import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
    createTemplate,
    getTemplates,
    deleteTemplate
} from '../controllers/templateController.js';

const router = express.Router();

// Public/Protected routes (Users need to see templates)
router.get('/', protect, getTemplates); // Or allow public: router.get('/', getTemplates);

// Admin only routes
router.post('/', protect, authorize('admin', 'superadmin'), createTemplate);
router.delete('/:id', protect, authorize('admin', 'superadmin'), deleteTemplate);

export default router;
