
import { Response } from "express";
import mongoose from "mongoose";
import axios from "axios";
import type { Server } from "socket.io";

import Meeting from "../models/Meeting.js";
import Transcript from "../models/Transcript.js";
import MeetingSummary from "../models/MeetingSummary.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { AuthRequest } from "../middleware/authMiddleware.js";

const MODEL = "openrouter/free";

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

interface GeneratedActionItem {
  task: string;
  assignee: string | null;
  dueDate: string | null;
  priority: "high" | "medium" | "low";
}

interface GeneratedSummary {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: GeneratedActionItem[];
}

export const generateMeetingSummary = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const meetingId = String(req.params.meetingId);
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      res.status(400).json({
        success: false,
        message: "Invalid meeting ID.",
      });
      return;
    }

    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      res.status(404).json({
        success: false,
        message: "Meeting not found.",
      });
      return;
    }

    // Only the meeting host can generate or regenerate summaries.
    const isCreator =
      String(meeting.createdBy) === String(userId);

    if (!isCreator) {
      res.status(403).json({
        success: false,
        message:
          "Only the meeting host can generate or regenerate the AI summary.",
      });
      return;
    }

    // Get the latest meeting transcript.
    const transcript = await Transcript.findOne({
      meeting: meetingId,
    }).sort({ createdAt: -1 });

    if (!transcript) {
      res.status(404).json({
        success: false,
        message: "No transcript found for this meeting.",
      });
      return;
    }

    if (!transcript.text.trim()) {
      res.status(422).json({
        success: false,
        message: "The transcript is empty.",
      });
      return;
    }

    // OpenRouter API configuration.
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      res.status(500).json({
        success: false,
        message: "OpenRouter API key is not configured.",
      });
      return;
    }

    const prompt = `
Analyze the following meeting transcript.

Extract the following information:

1. A clear and concise meeting summary.
2. Important discussion points.
3. Decisions actually made during the meeting.
4. Action items and tasks.

For every action item:
- Include the task description.
- Include the assignee only if clearly identifiable.
- Include a due date only if explicitly mentioned.
- Set priority to high, medium, or low based on the discussion.
- Do not invent tasks, assignees, or deadlines.

If information is unavailable, use null for assignee and dueDate.

Return ONLY valid JSON in this exact structure:

{
  "summary": "Meeting summary",
  "keyPoints": ["Point 1", "Point 2"],
  "decisions": ["Decision 1"],
  "actionItems": [
    {
      "task": "Task description",
      "assignee": null,
      "dueDate": null,
      "priority": "medium"
    }
  ]
}

Meeting transcript:

${transcript.text}
`;

    // Call OpenRouter with retries for temporary failures.
    let generatedText = "";
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await axios.post(
          OPENROUTER_URL,
          {
            model: MODEL,
            messages: [
              {
                role: "system",
                content:
                  "You are an AI meeting assistant. Analyze transcripts accurately. Return only valid JSON matching the requested structure. Never invent information.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            response_format: {
              type: "json_object",
            },
            temperature: 0.2,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "http://localhost:5173",
              "X-Title": "IntellMeet",
            },
            timeout: 120000,
          }
        );

        const content =
          response.data?.choices?.[0]?.message?.content;

        if (typeof content !== "string" || !content.trim()) {
          throw new Error(
            "OpenRouter returned an empty summary."
          );
        }

        generatedText = content.trim();
        break;
      } catch (error) {
        lastError = error;

        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;

        const isTemporary =
          status === 429 ||
          status === 500 ||
          status === 502 ||
          status === 503 ||
          status === 504;

        if (!isTemporary || attempt === 3) {
          throw error;
        }

        const delay = attempt * 3000;

        console.log(
          `OpenRouter temporarily unavailable. Retry ${attempt}/3 in ${delay / 1000} seconds.`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, delay)
        );
      }
    }

    if (!generatedText) {
      throw (
        lastError ||
        new Error("OpenRouter summary generation failed.")
      );
    }

    // Parse AI-generated JSON.
    let generated: GeneratedSummary;

    try {
      generated = JSON.parse(generatedText);
    } catch {
      throw new Error(
        "OpenRouter returned invalid JSON."
      );
    }

    // Validate generated summary structure.
    if (
      typeof generated.summary !== "string" ||
      !Array.isArray(generated.keyPoints) ||
      !Array.isArray(generated.decisions) ||
      !Array.isArray(generated.actionItems)
    ) {
      throw new Error(
        "OpenRouter returned an invalid summary structure."
      );
    }

    // Normalize action items.
    const actionItems = generated.actionItems.map((item) => {
      const priority = ["high", "medium", "low"].includes(
        item.priority
      )
        ? item.priority
        : "medium";

      let dueDate: Date | null = null;

      if (item.dueDate) {
        const parsedDate = new Date(item.dueDate);

        if (!Number.isNaN(parsedDate.getTime())) {
          dueDate = parsedDate;
        }
      }

      return {
        task: String(item.task || "Unspecified task"),
        assignee: item.assignee
          ? String(item.assignee)
          : null,
        dueDate,
        priority,
      };
    });

    // Get the previous summary to prevent duplicate notifications.
    const previousSummary = await MeetingSummary.findOne({
      transcript: transcript._id,
    });

    // Save or update the meeting summary.
    const summary = await MeetingSummary.findOneAndUpdate(
      { transcript: transcript._id },
      {
        meeting: meeting._id,
        transcript: transcript._id,
        generatedBy: userId,
        summary: generated.summary,
        keyPoints: generated.keyPoints.map(String),
        decisions: generated.decisions.map(String),
        actionItems,
        modelName: MODEL,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    // Get the Socket.IO server instance.
    const io = req.app.get("io") as Server | undefined;

    // Broadcast the saved summary to all meeting participants.
    io?.to(meetingId).emit("meeting-summary-updated", {
      roomId: meetingId,
      summary,
    });

    // Notify users assigned to newly extracted meeting action items.
    try {
      const memberIds = [
        meeting.createdBy.toString(),
        ...meeting.participants.map((participant) =>
          participant.toString()
        ),
      ];

      const uniqueMemberIds = [...new Set(memberIds)];

      const members = await User.find({
        _id: { $in: uniqueMemberIds },
      }).select("name email");

      // Build keys for action items in the previous summary.
      const previousActionKeys = new Set(
        (previousSummary?.actionItems || []).map((item) => {
          const task = String(item.task || "")
            .trim()
            .toLowerCase();

          const assignee = String(item.assignee || "")
            .trim()
            .toLowerCase();

          return `${task}::${assignee}`;
        })
      );

      const processedKeys = new Set<string>();

      for (const item of actionItems) {
        if (!item.assignee) continue;

        const task = item.task.trim();

        const normalizedAssignee = item.assignee
          .trim()
          .toLowerCase();

        const actionKey =
          `${task.toLowerCase()}::${normalizedAssignee}`;

        // Skip previously notified or repeated action items.
        if (
          previousActionKeys.has(actionKey) ||
          processedKeys.has(actionKey)
        ) {
          continue;
        }

        processedKeys.add(actionKey);

        // Resolve the AI-generated assignee to a meeting member.
        const assignedUser = members.find((member) => {
          const name = String(member.name || "")
            .trim()
            .toLowerCase();

          const email = String(member.email || "")
            .trim()
            .toLowerCase();

          return (
            name === normalizedAssignee ||
            email === normalizedAssignee
          );
        });

        // Do not notify if the assignee cannot be matched.
        if (!assignedUser) {
          console.log(
            `Action item assignee not matched: ${item.assignee}`
          );
          continue;
        }

        const notification = await Notification.create({
          recipient: assignedUser._id,
          sender: userId,
          type: "meeting-action-item",
          title: "New meeting action item assigned",
          message: `${task} (Priority: ${item.priority})`,
          relatedMeeting: meeting._id,
        });

        const populatedNotification =
          await Notification.findById(
            notification._id
          ).populate("sender", "name email");

        if (populatedNotification) {
          io?.to(
            `user:${assignedUser._id.toString()}`
          ).emit(
            "new-notification",
            populatedNotification
          );
        }
      }
    } catch (notificationError) {
      // Notification errors must not invalidate a successfully generated summary.
      console.error(
        "Meeting action-item notification error:",
        notificationError
      );
    }

    res.status(200).json({
      success: true,
      message: "Meeting summary generated successfully.",
      summary,
    });
  } catch (error) {
    console.error(
      "Meeting summary generation error:",
      error
    );

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;

      if (
        status === 429 ||
        status === 503 ||
        status === 504
      ) {
        res.status(503).json({
          success: false,
          message:
            "OpenRouter is temporarily busy or rate-limited. Please try again later.",
        });
        return;
      }

      console.error(
        "OpenRouter error details:",
        error.response?.data || error.message
      );

      res.status(502).json({
        success: false,
        message:
          "The OpenRouter AI service could not process the summary request.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Failed to generate meeting summary.",
      error:
        error instanceof Error
          ? error.message
          : "Unknown summary generation error.",
    });
  }
};

// Retrieve an existing meeting summary.
// Both the host and authorized participants can view it.
export const getMeetingSummary = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const meetingId = String(req.params.meetingId);
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      res.status(400).json({
        success: false,
        message: "Invalid meeting ID.",
      });
      return;
    }

    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      res.status(404).json({
        success: false,
        message: "Meeting not found.",
      });
      return;
    }

    const isCreator =
      String(meeting.createdBy) === String(userId);

    const isParticipant = meeting.participants.some(
      (participant) =>
        String(participant) === String(userId)
    );

    if (!isCreator && !isParticipant) {
      res.status(403).json({
        success: false,
        message:
          "You are not authorized to access this meeting.",
      });
      return;
    }

    const summary = await MeetingSummary.findOne({
      meeting: meetingId,
    }).sort({ createdAt: -1 });

    if (!summary) {
      res.status(404).json({
        success: false,
        message:
          "No AI summary has been generated yet.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error(
      "Get meeting summary error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to retrieve meeting summary.",
    });
  }
};
