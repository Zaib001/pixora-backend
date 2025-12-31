import express from "express";
import {
    getUserSubscription,
    cancelSubscription,
    reactivateSubscription,
    updateSubscriptionPlan,
    getAllSubscriptions,
    getSubscriptionStats,
} from "../controllers/subscriptionController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// User routes (protected)
router.use(protect);

router.get("/", getUserSubscription);
router.post("/cancel", cancelSubscription);
router.post("/reactivate", reactivateSubscription);
router.patch("/update", updateSubscriptionPlan);

// Admin routes
router.get("/all", authorize("admin", "superadmin"), getAllSubscriptions);
router.get("/stats", authorize("admin", "superadmin"), getSubscriptionStats);

export default router;
