import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  generateMeetingSummary,
  getMeetingSummary,
} from "../controllers/summaryController.js";

const router = Router();

router.post("/:meetingId", protect, generateMeetingSummary);
router.get("/:meetingId", protect, getMeetingSummary);

export default router;