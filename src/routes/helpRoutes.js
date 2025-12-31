import express from "express";
import {
    getHelpContent,
    createTutorial,
    updateTutorial,
    deleteTutorial,
    createFAQ,
    updateFAQ,
    deleteFAQ
} from "../controllers/helpController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// @desc    Get Help Content
// @route   GET /api/help
// @access  Private (accessible to all logged in users)
router.get("/", protect, getHelpContent);

// ADMIN ROUTES

// @desc    Manage Tutorials
router.post("/tutorials", protect, authorize('admin', 'superadmin'), createTutorial);
router.put("/tutorials/:id", protect, authorize('admin', 'superadmin'), updateTutorial);
router.delete("/tutorials/:id", protect, authorize('admin', 'superadmin'), deleteTutorial);

// @desc    Manage FAQs
router.post("/faqs", protect, authorize('admin', 'superadmin'), createFAQ);
router.put("/faqs/:id", protect, authorize('admin', 'superadmin'), updateFAQ);
router.delete("/faqs/:id", protect, authorize('admin', 'superadmin'), deleteFAQ);

export default router;
