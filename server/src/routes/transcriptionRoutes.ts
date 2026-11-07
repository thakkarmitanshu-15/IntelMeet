
import { Router } from "express";
import multer from "multer";

import { protect } from "../middleware/authMiddleware.js";
import { transcribeMeetingAudio } from "../controllers/transcriptionController.js";

const router = Router();

const allowedMimeTypes = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/vnd.wave",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/x-m4a",
  "application/octet-stream",
];

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 14 * 1024 * 1024,
  },

  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLowerCase().split(".").pop();

    const supportedExtensions = [
      "wav", "mp3", "webm", "mp4", "ogg", "aac", "flac", "m4a",
    ];

    if (
      allowedMimeTypes.includes(file.mimetype.toLowerCase()) &&
      supportedExtensions.includes(extension ?? "")
    ) {
      callback(null, true);
      return;
    }

    callback(
      new Error("Unsupported audio format. Please upload a supported audio file.")
    );
  },
});

router.post(
  "/:meetingId",
  protect,
  upload.single("audio"),
  transcribeMeetingAudio
);

export default router;
