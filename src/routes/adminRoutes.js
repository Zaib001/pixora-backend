import express from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import {
    getAllUsers,
    getUserById,
    updateUserRole,
    toggleUserStatus,
    getUserStats,
    getDashboardStats,
    getRevenueAnalytics,
    getCreditAnalytics,
    getActivityLogs,
    refundTransaction,
    getAllContent,
    deleteContent,
} from "../controllers/adminController.js";
import {
    getAllModels,
    createModel,
    updateModel,
    deleteModel,
    toggleModelStatus,
    saveAPIKeys,
    getAPIKeys,
    testModel,
} from "../controllers/modelController.js";

const router = express.Router();

// All routes are protected and require admin or superadmin role
// User Management
router.get("/users", protect, authorize("admin", "superadmin"), getAllUsers);
router.get("/users/:id", protect, authorize("admin", "superadmin"), getUserById);
router.patch("/users/:id/role", protect, authorize("admin", "superadmin"), updateUserRole);
router.patch("/users/:id/status", protect, authorize("admin", "superadmin"), toggleUserStatus);

// Statistics
router.get("/stats/users", protect, authorize("admin", "superadmin"), getUserStats);
router.get("/stats/dashboard", protect, authorize("admin", "superadmin"), getDashboardStats);

// Analytics
router.get("/analytics/revenue", protect, authorize("admin", "superadmin"), getRevenueAnalytics);
router.get("/analytics/credits", protect, authorize("admin", "superadmin"), getCreditAnalytics);

// Activity Logs
router.get("/activity-logs", protect, authorize("admin", "superadmin"), getActivityLogs);

// Refund Transaction
// Refund Transaction
router.post("/transactions/:id/refund", protect, authorize("admin", "superadmin"), refundTransaction);

// Content Management
router.get("/content", protect, authorize("admin", "superadmin"), getAllContent);
router.delete("/content/:id", protect, authorize("admin", "superadmin"), deleteContent);

// Model Management
router.get("/models", protect, authorize("admin", "superadmin"), getAllModels);
router.post("/models", protect, authorize("admin", "superadmin"), createModel);
router.put("/models/:id", protect, authorize("admin", "superadmin"), updateModel);
router.delete("/models/:id", protect, authorize("admin", "superadmin"), deleteModel);
router.patch("/models/:id/toggle", protect, authorize("admin", "superadmin"), toggleModelStatus);

// API Configuration
router.post("/config/api-keys", protect, authorize("admin", "superadmin"), saveAPIKeys);
router.get("/config/api-keys", protect, authorize("admin", "superadmin"), getAPIKeys);
router.post("/config/test-model", protect, authorize("admin", "superadmin"), testModel);

export default router;

