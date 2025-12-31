import express from "express";
import {
  getCreditBalance,
  getUserCreditBalance,
  addCredits
} from "../controllers/creditController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// User routes
router.use(protect); // All credit routes require authentication

router.get("/balance", getCreditBalance);

// Admin routes
router.get("/balance/:userId", authorize("admin", "superadmin"), getUserCreditBalance);


router.post("/add", addCredits);

export default router;
