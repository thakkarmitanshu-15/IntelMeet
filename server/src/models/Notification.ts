
import mongoose, { Document, Schema } from "mongoose";

export type NotificationType =
  | "task-assigned"
  | "meeting-action-item"
  | "mention";

export interface INotification extends Document {
  recipient: mongoose.Types.ObjectId;
  sender?: mongoose.Types.ObjectId | null;
  type: NotificationType;
  title: string;
  message: string;
  relatedMeeting?: mongoose.Types.ObjectId | null;
  relatedProject?: mongoose.Types.ObjectId | null;
  relatedTask?: mongoose.Types.ObjectId | null;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    type: {
      type: String,
      enum: ["task-assigned", "meeting-action-item", "mention"],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    relatedMeeting: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
      default: null,
    },
    relatedProject: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    relatedTask: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

notificationSchema.index({
  recipient: 1,
  isRead: 1,
  createdAt: -1,
});

const Notification = mongoose.model<INotification>(
  "Notification",
  notificationSchema
);

export default Notification;
