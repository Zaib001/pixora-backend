import express from "express";
import { getActiveModels as getPublicModels } from "../controllers/publicController.js";
import { getActiveModels, getPublicConfig } from "../controllers/modelController.js";

const router = express.Router();

// Public routes (no authentication required)
router.get("/models", getPublicModels);
router.get("/models/active", getActiveModels);
router.get("/config", getPublicConfig);

export default router;
