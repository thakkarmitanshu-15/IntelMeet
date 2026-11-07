
import { Response } from "express";
import mongoose from "mongoose";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { AuthRequest } from "../middleware/authMiddleware.js";
import { Server } from "socket.io";

const priorities = ["low", "medium", "high"] as const;
const statuses = ["todo", "in-progress", "review", "completed"] as const;

// Create a notification when a task is assigned
const createTaskAssignmentNotification = async (
  recipientId: mongoose.Types.ObjectId,
  senderId: string,
  taskId: mongoose.Types.ObjectId,
  projectId: mongoose.Types.ObjectId,
  taskTitle: string,
  projectTitle: string,
  io?: Server
): Promise<void> => {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      type: "task-assigned",
      title: "New task assigned to you",
      message: `You have been assigned "${taskTitle}" in project "${projectTitle}".`,
      relatedProject: projectId,
      relatedTask: taskId,
      isRead: false,
    });

    // Send notification immediately to the recipient.
    if (io) {
      const populatedNotification = await Notification.findById(
        notification._id
      )
        .populate("sender", "name email")
        .populate("relatedProject", "title")
        .populate("relatedTask", "title");

      io.to(`user:${recipientId.toString()}`).emit(
        "new-notification",
        populatedNotification
      );
    }
  } catch (error) {
    console.error("Task assignment notification error:", error);
  }
};

// Create a task
export const createTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.userId;
    const { projectId } = req.params;
    const { title, description, assignedTo, dueDate, priority, status } =
      req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!mongoose.isValidObjectId(projectId)) {
      res.status(400).json({ success: false, message: "Invalid project ID" });
      return;
    }

    if (typeof title !== "string" || title.trim().length < 2) {
      res.status(400).json({
        success: false,
        message: "Task title must contain at least 2 characters",
      });
      return;
    }

    const project = await Project.findOne({
      _id: projectId,
      members: userId,
    });

    if (!project) {
      res.status(404).json({
        success: false,
        message: "Project not found or access denied",
      });
      return;
    }

    let assigneeId: mongoose.Types.ObjectId | null = null;

    if (assignedTo) {
      if (!mongoose.isValidObjectId(assignedTo)) {
        res.status(400).json({
          success: false,
          message: "Invalid assignee ID",
        });
        return;
      }

      const isMember = project.members.some(
        (member) => member.toString() === String(assignedTo)
      );

      const assigneeExists = await User.exists({ _id: assignedTo });

      if (!isMember || !assigneeExists) {
        res.status(400).json({
          success: false,
          message: "Assignee must be a member of this project",
        });
        return;
      }

      assigneeId = new mongoose.Types.ObjectId(assignedTo);
    }

    if (priority !== undefined && !priorities.includes(priority)) {
      res.status(400).json({
        success: false,
        message: "Invalid priority",
      });
      return;
    }

    if (status !== undefined && !statuses.includes(status)) {
      res.status(400).json({
        success: false,
        message: "Invalid task status",
      });
      return;
    }

    let parsedDueDate: Date | null = null;

    if (dueDate) {
      parsedDueDate = new Date(dueDate);

      if (Number.isNaN(parsedDueDate.getTime())) {
        res.status(400).json({
          success: false,
          message: "Invalid due date",
        });
        return;
      }
    }

    const task = await Task.create({
      title: title.trim(),
      description: description?.trim() || "",
      project: project._id,
      createdBy: userId,
      assignedTo: assigneeId,
      dueDate: parsedDueDate,
      priority: priority || "medium",
      status: status || "todo",
    });

    // Notify the assigned member, but not the task creator.
    if (assigneeId && assigneeId.toString() !== userId) {
      await createTaskAssignmentNotification(
        assigneeId,
        userId,
        task._id,
        project._id,
        task.title,
        project.title,
        req.app.get("io") as Server | undefined
      );
    }

    const populatedTask = await Task.findById(task._id)
      .populate("createdBy", "name email avatar")
      .populate("assignedTo", "name email avatar")
      .populate("project", "title");

    res.status(201).json({
      success: true,
      message: "Task created successfully",
      task: populatedTask,
    });
  } catch (error) {
    console.error("Create task error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create task",
    });
  }
};

// Get all tasks for a project
export const getProjectTasks = async (
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
    });

    if (!project) {
      res.status(404).json({
        success: false,
        message: "Project not found or access denied",
      });
      return;
    }

    const tasks = await Task.find({ project: project._id })
      .populate("createdBy", "name email avatar")
      .populate("assignedTo", "name email avatar")
      .populate("project", "title")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: tasks.length,
      tasks,
    });
  } catch (error) {
    console.error("Get project tasks error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve tasks",
    });
  }
};

// Update task details, assignee, priority or status
export const updateTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.userId;
    const { taskId } = req.params;
    const { title, description, assignedTo, dueDate, priority, status } =
      req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!mongoose.isValidObjectId(taskId)) {
      res.status(400).json({ success: false, message: "Invalid task ID" });
      return;
    }

    const task = await Task.findById(taskId);

    if (!task) {
      res.status(404).json({ success: false, message: "Task not found" });
      return;
    }

    const project = await Project.findOne({
      _id: task.project,
      members: userId,
    });

    if (!project) {
      res.status(403).json({
        success: false,
        message: "You do not have access to this task",
      });
      return;
    }

    // Remember the previous assignee to detect reassignment.
    const previousAssigneeId = task.assignedTo?.toString() || null;

    if (title !== undefined) {
      if (
        typeof title !== "string" ||
        title.trim().length < 2 ||
        title.trim().length > 150
      ) {
        res.status(400).json({
          success: false,
          message: "Task title must contain 2 to 150 characters",
        });
        return;
      }

      task.title = title.trim();
    }

    if (description !== undefined) {
      if (
        typeof description !== "string" ||
        description.length > 2000
      ) {
        res.status(400).json({
          success: false,
          message: "Description must be 2000 characters or fewer",
        });
        return;
      }

      task.description = description.trim();
    }

    if (assignedTo !== undefined) {
      if (assignedTo === null || assignedTo === "") {
        task.assignedTo = null;
      } else {
        if (!mongoose.isValidObjectId(assignedTo)) {
          res.status(400).json({
            success: false,
            message: "Invalid assignee ID",
          });
          return;
        }

        const isMember = project.members.some(
          (member) => member.toString() === String(assignedTo)
        );

        if (!isMember || !(await User.exists({ _id: assignedTo }))) {
          res.status(400).json({
            success: false,
            message: "Assignee must be a project member",
          });
          return;
        }

        task.assignedTo = new mongoose.Types.ObjectId(assignedTo);
      }
    }

    if (dueDate !== undefined) {
      if (dueDate === null || dueDate === "") {
        task.dueDate = null;
      } else {
        const parsedDate = new Date(dueDate);

        if (Number.isNaN(parsedDate.getTime())) {
          res.status(400).json({
            success: false,
            message: "Invalid due date",
          });
          return;
        }

        task.dueDate = parsedDate;
      }
    }

    if (priority !== undefined) {
      if (!priorities.includes(priority)) {
        res.status(400).json({
          success: false,
          message: "Invalid priority",
        });
        return;
      }

      task.priority = priority;
    }

    if (status !== undefined) {
      if (!statuses.includes(status)) {
        res.status(400).json({
          success: false,
          message: "Invalid task status",
        });
        return;
      }

      task.status = status;
    }

    await task.save();

    const newAssigneeId = task.assignedTo?.toString() || null;

    // Notify only when the task is assigned to a different member.
    if (
      newAssigneeId &&
      newAssigneeId !== previousAssigneeId &&
      newAssigneeId !== userId
    ) {
      await createTaskAssignmentNotification(
        task.assignedTo as mongoose.Types.ObjectId,
        userId,
        task._id,
        project._id,
        task.title,
        project.title,
        req.app.get("io") as Server | undefined
      );
    }

    const updatedTask = await Task.findById(task._id)
      .populate("createdBy", "name email avatar")
      .populate("assignedTo", "name email avatar")
      .populate("project", "title");

    res.status(200).json({
      success: true,
      message: "Task updated successfully",
      task: updatedTask,
    });
  } catch (error) {
    console.error("Update task error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update task",
    });
  }
};

// Delete a task
export const deleteTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.userId;
    const { taskId } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!mongoose.isValidObjectId(taskId)) {
      res.status(400).json({ success: false, message: "Invalid task ID" });
      return;
    }

    const task = await Task.findById(taskId);

    if (!task) {
      res.status(404).json({ success: false, message: "Task not found" });
      return;
    }

    const project = await Project.findOne({
      _id: task.project,
      members: userId,
    });

    if (!project) {
      res.status(403).json({
        success: false,
        message: "You do not have access to this task",
      });
      return;
    }

    if (
      task.createdBy.toString() !== userId &&
      project.createdBy.toString() !== userId
    ) {
      res.status(403).json({
        success: false,
        message: "Only the task creator or project creator can delete it",
      });
      return;
    }

    await task.deleteOne();

    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error("Delete task error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete task",
    });
  }
};
