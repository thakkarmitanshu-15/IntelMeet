
import { Response } from "express";
import Meeting from "../models/Meeting.js";
import { AuthRequest } from "../middleware/authMiddleware.js";

export const createMeeting = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { title, description, participants, startTime, endTime, meetingLink } =
      req.body;

    if (!title || !startTime || !endTime) {
      res.status(400).json({
        message: "Title, start time, and end time are required.",
      });
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      res.status(400).json({
        message: "Please provide valid meeting dates.",
      });
      return;
    }

    if (end <= start) {
      res.status(400).json({
        message: "Meeting end time must be after start time.",
      });
      return;
    }

    const meeting = await Meeting.create({
      title,
      description,
      participants: participants ?? [],
      startTime: start,
      endTime: end,
      meetingLink,
      createdBy: req.userId,
    });

    res.status(201).json({
      message: "Meeting created successfully.",
      meeting,
    });
  } catch (error) {
    console.error("Create meeting error:", error);

    res.status(500).json({
      message: "Server error while creating meeting.",
    });
  }
};

export const getMeetings = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const meetings = await Meeting.find({
      $or: [
        { createdBy: req.userId },
        { participants: req.userId },
      ],
    })
      .populate("createdBy", "name email")
      .populate("participants", "name email")
      .sort({ startTime: 1 });

    res.status(200).json({
      count: meetings.length,
      meetings,
    });
  } catch (error) {
    console.error("Get meetings error:", error);

    res.status(500).json({
      message: "Server error while fetching meetings.",
    });
  }
};

export const getMeetingById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("participants", "name email");

    if (!meeting) {
      res.status(404).json({
        message: "Meeting not found.",
      });
      return;
    }

    // Check whether the current user created the meeting
    const creator = meeting.createdBy as any;

    const isCreator =
      creator &&
      creator._id.toString() === req.userId;

    // Check whether the current user is an invited participant
    const participants = meeting.participants as any[];

    const isParticipant = participants.some(
      (participant) =>
        participant._id.toString() === req.userId
    );

    if (!isCreator && !isParticipant) {
      res.status(403).json({
        message: "You are not authorized to access this meeting.",
      });
      return;
    }

    res.status(200).json({ meeting });
  } catch (error) {
    console.error("Get meeting error:", error);

    res.status(500).json({
      message: "Server error while fetching meeting.",
    });
  }
};

export const updateMeeting = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const allowedFields = [
      "title",
      "description",
      "participants",
      "startTime",
      "endTime",
      "meetingLink",
      "status",
    ];

    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (updates.startTime || updates.endTime) {
      const existingMeeting = await Meeting.findOne({
        _id: req.params.id,
        createdBy: req.userId,
      });

      if (!existingMeeting) {
        res.status(404).json({
          message: "Meeting not found.",
        });
        return;
      }

      const start = new Date(
        (updates.startTime as string | Date) ?? existingMeeting.startTime
      );

      const end = new Date(
        (updates.endTime as string | Date) ?? existingMeeting.endTime
      );

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end <= start
      ) {
        res.status(400).json({
          message: "Please provide a valid meeting time range.",
        });
        return;
      }

      updates.startTime = start;
      updates.endTime = end;
    }

    const meeting = await Meeting.findOneAndUpdate(
      {
        _id: req.params.id,
        createdBy: req.userId,
      },
      updates,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!meeting) {
      res.status(404).json({
        message: "Meeting not found.",
      });
      return;
    }

    res.status(200).json({
      message: "Meeting updated successfully.",
      meeting,
    });
  } catch (error) {
    console.error("Update meeting error:", error);

    res.status(500).json({
      message: "Server error while updating meeting.",
    });
  }
};

export const deleteMeeting = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const meeting = await Meeting.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.userId,
    });

    if (!meeting) {
      res.status(404).json({
        message: "Meeting not found.",
      });
      return;
    }

    res.status(200).json({
      message: "Meeting deleted successfully.",
    });
  } catch (error) {
    console.error("Delete meeting error:", error);

    res.status(500).json({
      message: "Server error while deleting meeting.",
    });
  }
};
