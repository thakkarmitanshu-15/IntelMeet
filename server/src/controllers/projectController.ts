
import { Response } from "express";
import mongoose from "mongoose";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import { AuthRequest } from "../middleware/authMiddleware.js";

// Create a project
export const createProject = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.userId;
    const { title, description, members = [] } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!title || typeof title !== "string" || title.trim().length < 2) {
      res.status(400).json({
        success: false,
        message: "Project title must contain at least 2 characters",
      });
      return;
    }

    if (!Array.isArray(members)) {
      res.status(400).json({
        success: false,
        message: "Members must be an array",
      });
      return;
    }

    const memberIds = [...new Set([userId, ...members.map(String)])];

    if (memberIds.some((id) => !mongoose.isValidObjectId(id))) {
      res.status(400).json({
        success: false,
        message: "One or more member IDs are invalid",
      });
      return;
    }

    const existingUsers = await User.countDocuments({
      _id: { $in: memberIds },
    });

    if (existingUsers !== memberIds.length) {
      res.status(400).json({
        success: false,
        message: "One or more users do not exist",
      });
      return;
    }

    const project = await Project.create({
      title: title.trim(),
      description: description?.trim() || "",
      createdBy: userId,
      members: memberIds,
    });

    const populatedProject = await Project.findById(project._id)
      .populate("createdBy", "name email avatar")
      .populate("members", "name email avatar");

    res.status(201).json({
      success: true,
      message: "Project created successfully",
      project: populatedProject,
    });
  } catch (error) {
    console.error("Create project error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create project",
    });
  }
};

// Get all projects belonging to the logged-in user
export const getProjects = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const projects = await Project.find({
      members: userId,
    })
      .populate("createdBy", "name email avatar")
      .populate("members", "name email avatar")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: projects.length,
      projects,
    });
  } catch (error) {
    console.error("Get projects error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve projects",
    });
  }
};

// Get a single project
export const getProjectById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.userId;
    const { projectId } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!mongoose.isValidObjectId(projectId)) {
      res.status(400).json({ success: false, message: "Invalid project ID" });
      return;
    }

    const project = await Project.findOne({
      _id: projectId,
      members: userId,
    })
      .populate("createdBy", "name email avatar")
      .populate("members", "name email avatar");

    if (!project) {
      res.status(404).json({
        success: false,
        message: "Project not found or access denied",
      });
      return;
    }

    res.status(200).json({ success: true, project });
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve project",
    });
  }
};

// Update project title and description (creator only)
export const updateProject = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.userId;
    const { projectId } = req.params;
    const { title, description } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!mongoose.isValidObjectId(projectId)) {
      res.status(400).json({ success: false, message: "Invalid project ID" });
      return;
    }

    const project = await Project.findOne({
      _id: projectId,
      createdBy: userId,
    });

    if (!project) {
      res.status(404).json({
        success: false,
        message: "Project not found or permission denied",
      });
      return;
    }

    if (title !== undefined) {
      if (
        typeof title !== "string" ||
        title.trim().length < 2 ||
        title.trim().length > 100
      ) {
        res.status(400).json({
          success: false,
          message: "Title must contain 2 to 100 characters",
        });
        return;
      }
      project.title = title.trim();
    }

    if (description !== undefined) {
      if (
        typeof description !== "string" ||
        description.length > 1000
      ) {
        res.status(400).json({
          success: false,
          message: "Description must be 1000 characters or fewer",
        });
        return;
      }
      project.description = description.trim();
    }

    await project.save();

    const updatedProject = await Project.findById(project._id)
      .populate("createdBy", "name email avatar")
      .populate("members", "name email avatar");

    res.status(200).json({
      success: true,
      message: "Project updated successfully",
      project: updatedProject,
    });
  } catch (error) {
    console.error("Update project error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update project",
    });
  }
};

// Add a member (creator only)
export const addProjectMember = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.userId;
    const { projectId } = req.params;
    const { memberId } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!mongoose.isValidObjectId(projectId) ||
        !mongoose.isValidObjectId(memberId)) {
      res.status(400).json({
        success: false,
        message: "Invalid project or member ID",
      });
      return;
    }

    const project = await Project.findOne({
      _id: projectId,
      createdBy: userId,
    });

    if (!project) {
      res.status(404).json({
        success: false,
        message: "Project not found or permission denied",
      });
      return;
    }

    const memberExists = await User.exists({ _id: memberId });

    if (!memberExists) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    if (!project.members.some((id) => id.toString() === memberId)) {
      project.members.push(new mongoose.Types.ObjectId(memberId));
      await project.save();
    }

    const updatedProject = await Project.findById(project._id)
      .populate("createdBy", "name email avatar")
      .populate("members", "name email avatar");

    res.status(200).json({
      success: true,
      message: "Project member added successfully",
      project: updatedProject,
    });
  } catch (error) {
    console.error("Add project member error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add project member",
    });
  }
};

// Remove a member (creator only; creator cannot remove themselves)
export const removeProjectMember = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.userId;
    const { projectId, memberId } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (
      !mongoose.isValidObjectId(projectId) ||
      !mongoose.isValidObjectId(memberId)
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid project or member ID",
      });
      return;
    }

    const project = await Project.findOne({
      _id: projectId,
      createdBy: userId,
    });

    if (!project) {
      res.status(404).json({
        success: false,
        message: "Project not found or permission denied",
      });
      return;
    }

    if (project.createdBy.toString() === memberId) {
      res.status(400).json({
        success: false,
        message: "Project creator cannot be removed",
      });
      return;
    }

    project.members = project.members.filter(
      (id) => id.toString() !== memberId
    );

    await project.save();

    // Unassign this user from tasks in the project.
    await Task.updateMany(
      { project: project._id, assignedTo: memberId },
      { $set: { assignedTo: null } }
    );

    const updatedProject = await Project.findById(project._id)
      .populate("createdBy", "name email avatar")
      .populate("members", "name email avatar");

    res.status(200).json({
      success: true,
      message: "Project member removed successfully",
      project: updatedProject,
    });
  } catch (error) {
    console.error("Remove project member error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove project member",
    });
  }
};

// Delete a project and its tasks (creator only)
export const deleteProject = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.userId;
    const { projectId } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!mongoose.isValidObjectId(projectId)) {
      res.status(400).json({ success: false, message: "Invalid project ID" });
      return;
    }

    const project = await Project.findOne({
      _id: projectId,
      createdBy: userId,
    });

    if (!project) {
      res.status(404).json({
        success: false,
        message: "Project not found or permission denied",
      });
      return;
    }

    await Task.deleteMany({ project: project._id });
    await project.deleteOne();

    res.status(200).json({
      success: true,
      message: "Project and its tasks deleted successfully",
    });
  } catch (error) {
    console.error("Delete project error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete project",
    });
  }
};
