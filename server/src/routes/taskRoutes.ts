
import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";

import {
  createTask,
  getProjectTasks,
  updateTask,
  deleteTask,
} from "../controllers/taskController.js";

const router = Router();

// All task routes require authentication
router.use(protect);

// Create and list tasks inside a project
router.post("/project/:projectId", createTask);
router.get("/project/:projectId", getProjectTasks);

// Update and delete individual tasks
router.put("/:taskId", updateTask);
router.delete("/:taskId", deleteTask);

export default router;
