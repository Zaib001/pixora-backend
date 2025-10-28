import express from "express";
import { success } from "../utils/response.js";

const router = express.Router();

router.get("/", (req, res) =>
  success(res, { status: "OK" }, "Pixora API is running")
);

export default router;
