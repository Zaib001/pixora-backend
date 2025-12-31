import express from "express";
import {
    getUserTransactions,
    getAllTransactions,
    getPendingTransactions,
    approveTransaction,
    rejectTransaction,
    getTransactionStats,
    getTransactionById,
} from "../controllers/transactionController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// User routes (protected)
router.use(protect);

router.get("/", getUserTransactions);

// Admin routes
router.get("/admin/all", authorize("admin", "superadmin"), getAllTransactions);
router.get("/admin/pending", authorize("admin", "superadmin"), getPendingTransactions);
router.get("/admin/stats", authorize("admin", "superadmin"), getTransactionStats);
router.get("/admin/:id", authorize("admin", "superadmin"), getTransactionById);
router.patch("/admin/:id/approve", authorize("admin", "superadmin"), approveTransaction);
router.patch("/admin/:id/reject", authorize("admin", "superadmin"), rejectTransaction);

export default router;
