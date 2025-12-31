import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import Content from "../models/Content.js";
import {
    generateContent,
    getFreeTierStatus,
    getContentHistory,
    getDashboardStats,
    getCommunityContent,
    streamVideo,
    streamImage,
    enhancePrompt,
    deleteContent
} from "../controllers/contentController.js";

const router = express.Router();

// @desc    Get Community Content
// @route   GET /api/content/community
// @access  Public
router.get("/community", getCommunityContent);

// @desc    Generate Content (Stubbed for now)
// @route   POST /api/content/generate
// @access  Private
router.post("/generate", protect, generateContent);

// @desc    Enhance Prompt
// @route   POST /api/content/enhance-prompt
// @access  Private
router.post("/enhance-prompt", protect, enhancePrompt);

// @desc    Get Free Tier Status
// @route   GET /api/content/free-tier-status
// @access  Private
router.get("/free-tier-status", protect, getFreeTierStatus);

// @desc    Get Dashboard Stats
// @route   GET /api/content/dashboard-stats
// @access  Private
router.get("/dashboard-stats", protect, getDashboardStats);

// @desc    Get Content History
// @route   GET /api/content/history
// @access  Private
router.get("/history", protect, getContentHistory);

// @desc    Stream Video
// @route   GET /api/content/stream/video/:videoId
// @access  Public (Used by frontend player)
router.get("/stream/video/:videoId", streamVideo);

// @desc    Stream Image
// @route   GET /api/content/stream/image/:imageId
// @access  Public (Used by frontend display)
router.get("/stream/image/:imageId", streamImage);

// @desc    Delete Content
// @route   DELETE /api/content/:id
// @access  Private
router.delete("/:id", protect, deleteContent);

export default router;
