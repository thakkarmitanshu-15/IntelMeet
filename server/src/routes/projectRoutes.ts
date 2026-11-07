
import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";

import {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  addProjectMember,
  removeProjectMember,
  deleteProject,
} from "../controllers/projectController.js";

const router = Router();

// All project routes require authentication
router.use(protect);

// Create and list projects
router.post("/", createProject);
router.get("/", getProjects);

// Get, update and delete a specific project
router.get("/:projectId", getProjectById);
router.put("/:projectId", updateProject);
router.delete("/:projectId", deleteProject);

// Manage project members
router.post("/:projectId/members", addProjectMember);
router.delete("/:projectId/members/:memberId", removeProjectMember);

export default router;
