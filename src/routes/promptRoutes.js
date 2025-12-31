import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
    generatePromptIdeas,
    enhancePrompt,
} from "../controllers/promptController.js";

const router = express.Router();

// All routes are protected (require authentication)
router.post("/ideas", protect, generatePromptIdeas);
router.post("/enhance", protect, enhancePrompt);

export default router;
