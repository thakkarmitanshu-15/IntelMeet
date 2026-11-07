import mongoose, { Document, Schema } from "mongoose";

export interface IMeeting extends Document {
  title: string;
  description?: string;
  createdBy: mongoose.Types.ObjectId;
  participants: mongoose.Types.ObjectId[];
  startTime: Date;
  endTime: Date;
  status: "scheduled" | "in-progress" | "completed" | "cancelled";
  meetingLink?: string;
  createdAt: Date;
  updatedAt: Date;
}

const meetingSchema = new Schema<IMeeting>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    startTime: {
      type: Date,
      required: true,
    },

    endTime: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["scheduled", "in-progress", "completed", "cancelled"],
      default: "scheduled",
    },

    meetingLink: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const Meeting = mongoose.model<IMeeting>("Meeting", meetingSchema);

export default Meeting;