
import mongoose, { Schema } from "mongoose";

export interface ITranscript {
  meeting: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  text: string;
  originalFileName: string;
  mimeType: string;
  modelName: string;
  createdAt: Date;
  updatedAt: Date;
}

const transcriptSchema = new Schema<ITranscript>(
  {
    meeting: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    text: {
      type: String,
      required: true,
    },

    originalFileName: {
      type: String,
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
    },

    modelName: {
      type: String,
      required: true,
      default: "gemini-3.5-transcribe",
    },
  },
  {
    timestamps: true,
  }
);

const Transcript = mongoose.model<ITranscript>(
  "Transcript",
  transcriptSchema
);

export default Transcript;
