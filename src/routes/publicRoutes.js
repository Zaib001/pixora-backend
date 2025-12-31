import express from "express";
import { getActiveModels } from "../controllers/publicController.js";

const router = express.Router();

// Public routes (no authentication required)
router.get("/models", getActiveModels);

export default router;
