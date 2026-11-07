
import { Router } from "express";

import {
  createMeeting,
  getMeetings,
  getMeetingById,
  updateMeeting,
  deleteMeeting,
} from "../controllers/meetingController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = Router();

// Create a meeting
router.post("/", protect, createMeeting);

// Get meetings created by the logged-in user
router.get("/", protect, getMeetings);

// Get a single meeting by ID
router.get("/:id", protect, getMeetingById);

// Update a meeting by ID
router.put("/:id", protect, updateMeeting);

// Delete a meeting by ID
router.delete("/:id", protect, deleteMeeting);

export default router;
