
import mongoose, { Schema } from "mongoose";

export interface IActionItem {
  task: string;
  assignee: string | null;
  dueDate: Date | null;
  priority: "high" | "medium" | "low";
}

export interface IMeetingSummary {
  meeting: mongoose.Types.ObjectId;
  transcript: mongoose.Types.ObjectId;
  generatedBy: mongoose.Types.ObjectId;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: IActionItem[];
  modelName: string;
  createdAt: Date;
  updatedAt: Date;
}

const actionItemSchema = new Schema<IActionItem>(
  {
    task: {
      type: String,
      required: true,
    },
    assignee: {
      type: String,
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
  },
  { _id: true }
);

const meetingSummarySchema = new Schema<IMeetingSummary>(
  {
    meeting: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
      index: true,
    },
    transcript: {
      type: Schema.Types.ObjectId,
      ref: "Transcript",
      required: true,
    },
    generatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    keyPoints: {
      type: [String],
      default: [],
    },
    decisions: {
      type: [String],
      default: [],
    },
    actionItems: {
      type: [actionItemSchema],
      default: [],
    },
    modelName: {
      type: String,
      required: true,
      default: "gemini-2.5-flash",
    },
  },
  {
    timestamps: true,
  }
);

// One generated summary per transcript.
meetingSummarySchema.index({ transcript: 1 }, { unique: true });

const MeetingSummary = mongoose.model<IMeetingSummary>(
  "MeetingSummary",
  meetingSummarySchema
);

export default MeetingSummary;
