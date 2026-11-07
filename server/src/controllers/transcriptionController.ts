
import { Response } from "express";
import mongoose from "mongoose";
import { GoogleGenAI } from "@google/genai";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join, extname } from "path";
import { randomUUID } from "crypto";

import Meeting from "../models/Meeting.js";
import Transcript from "../models/Transcript.js";
import { AuthRequest } from "../middleware/authMiddleware.js";

const MODEL = "gemini-3.5-transcribe";

const MIME_TYPES: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".webm": "audio/webm",
  ".mp4": "audio/mp4",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
};

export const transcribeMeetingAudio = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  let temporaryFile: string | undefined;

  try {
    const meetingId = String(req.params.meetingId);
    const userId = req.userId;
    const audioFile = req.file;

    // Authentication check
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    // Meeting ID validation
    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      res.status(400).json({
        success: false,
        message: "Invalid meeting ID.",
      });
      return;
    }

    // Audio file validation
    if (!audioFile) {
      res.status(400).json({
        success: false,
        message: "Please upload an audio file.",
      });
      return;
    }

    // Resolve MIME type using the file extension
    const extension = extname(audioFile.originalname).toLowerCase();
    const normalizedMimeType = MIME_TYPES[extension];

    if (!normalizedMimeType) {
      res.status(400).json({
        success: false,
        message: "Unsupported audio file extension.",
      });
      return;
    }

    // Basic WAV file signature validation
    if (extension === ".wav") {
      const isWav =
        audioFile.buffer.length >= 12 &&
        audioFile.buffer.toString("ascii", 0, 4) === "RIFF" &&
        audioFile.buffer.toString("ascii", 8, 12) === "WAVE";

      if (!isWav) {
        res.status(400).json({
          success: false,
          message: "The uploaded file is not a valid WAV audio file.",
        });
        return;
      }
    }

    // Find meeting
    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      res.status(404).json({
        success: false,
        message: "Meeting not found.",
      });
      return;
    }

    // Check meeting access
    const isCreator = meeting.createdBy.toString() === userId;

    const isParticipant = meeting.participants.some(
      (participant) => participant.toString() === userId
    );

    if (!isCreator && !isParticipant) {
      res.status(403).json({
        success: false,
        message: "You are not authorized to access this meeting.",
      });
      return;
    }

    // Check Gemini API key
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      res.status(500).json({
        success: false,
        message: "Gemini API key is not configured.",
      });
      return;
    }

    const ai = new GoogleGenAI({ apiKey });

    // Save temporary audio file
    temporaryFile = join(
      tmpdir(),
      `${randomUUID()}${extension}`
    );

    await writeFile(temporaryFile, audioFile.buffer);

    // Upload audio to Gemini
    const uploadedAudio = await ai.files.upload({
      file: temporaryFile,
      config: {
        mimeType: normalizedMimeType,
      },
    });

    if (!uploadedAudio.uri) {
      throw new Error("Gemini audio upload failed.");
    }

    // Generate transcription
    const interaction = await ai.interactions.create({
      model: MODEL,
      input: [
        {
          type: "audio",
          uri: uploadedAudio.uri,
          mime_type: normalizedMimeType,
        },
      ],
      generation_config: {
        transcription_config: {
          mode: {
            type: "verbatim",
            diarization_mode: "speaker",
          },
        },
      },
    });

    const transcriptText = interaction.output_text?.trim();

    if (!transcriptText) {
      res.status(422).json({
        success: false,
        message: "No speech could be transcribed from this audio.",
      });
      return;
    }

    // Save transcript in MongoDB
    const transcript = await Transcript.create({
      meeting: meeting._id,
      createdBy: userId,
      text: transcriptText,
      originalFileName: audioFile.originalname,
      mimeType: normalizedMimeType,
      modelName: MODEL,
    });

    res.status(201).json({
      success: true,
      message: "Meeting audio transcribed successfully.",
      transcript,
    });
  } catch (error) {
    console.error("Meeting transcription error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to transcribe meeting audio.",
      error:
        error instanceof Error
          ? error.message
          : "Unknown transcription error.",
    });
  } finally {
    if (temporaryFile) {
      await unlink(temporaryFile).catch(() => undefined);
    }
  }
};
