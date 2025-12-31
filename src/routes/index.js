import express from "express";
import healthRoutes from "./healthRoutes.js";
import subscriptionRoutes from "./subscriptionRoutes.js";
import transactionRoutes from "./transactionRoutes.js";

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/transactions", transactionRoutes);

export default router;
