
import { Server, Socket } from "socket.io";
import Meeting from "../models/Meeting.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

interface JoinRoomData {
  roomId: string;
  userId: string;
  userName: string;
  cameraOn?: boolean;
  micOn?: boolean;
  isScreenSharing?: boolean;
}

interface SignalData {
  roomId: string;
  targetSocketId: string;
  signal: unknown;
}

interface IceCandidateData {
  roomId: string;
  targetSocketId: string;
  candidate: unknown;
}

interface LeaveRoomData {
  roomId: string;
}

interface ChatMessageData {
  roomId: string;
  message: string;
}

interface TypingData {
  roomId: string;
}

interface MediaStatusData {
  roomId: string;
  cameraOn: boolean;
  isScreenSharing: boolean;
}

interface MicStatusData {
  roomId: string;
  micOn: boolean;
}

interface Participant {
  socketId: string;
  userId: string;
  userName: string;
  cameraOn: boolean;
  micOn: boolean;
  isScreenSharing: boolean;
}

const setupSocket = (io: Server): void => {
  io.on("connection", (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Join a personal notification room for this authenticated user.
    const authenticatedUserId = socket.data.userId as string | undefined;

    if (authenticatedUserId) {
      socket.join(`user:${authenticatedUserId}`);
      console.log(`User ${authenticatedUserId} joined notification room`);
    }

    // Join a meeting room
    socket.on("join-room", async (data: JoinRoomData) => {
      try {
        const { roomId, userName } = data;

        // Use the identity verified by Socket.IO JWT middleware.
        const authenticatedUserId = socket.data.userId as
          | string
          | undefined;

        if (!roomId || !authenticatedUserId) {
          socket.emit("room-error", {
            message: "Invalid meeting room or authentication.",
          });
          return;
        }

        // Reject attempts to join using another user's identity.
        if (
          data.userId &&
          String(data.userId) !== String(authenticatedUserId)
        ) {
          socket.emit("room-error", {
            message: "User identity verification failed.",
          });
          return;
        }

        const userId = authenticatedUserId;

        // Verify meeting membership.
        const meeting = await Meeting.findById(roomId).select(
          "createdBy participants"
        );

        if (!meeting) {
          socket.emit("room-error", {
            message: "Meeting not found.",
          });
          return;
        }

        const isCreator =
          meeting.createdBy.toString() === String(userId);

        const isParticipant = meeting.participants.some(
          (participant) =>
            participant.toString() === String(userId)
        );

        if (!isCreator && !isParticipant) {
          socket.emit("room-error", {
            message: "You are not authorized to join this meeting.",
          });
          return;
        }

        // Avoid joining the same room twice.
        if (
          socket.data.roomId === roomId &&
          socket.rooms.has(roomId)
        ) {
          return;
        }

        // Leave any previously joined room.
        const previousRoomId = socket.data.roomId as
          | string
          | undefined;

        if (previousRoomId) {
          socket.to(previousRoomId).emit("user-left", {
            socketId: socket.id,
            userId: socket.data.userId,
            userName: socket.data.userName || "Guest",
          });

          await socket.leave(previousRoomId);
        }

        // Initialize joining user's media state.
        socket.data.cameraOn =
          typeof data.cameraOn === "boolean"
            ? data.cameraOn
            : true;

        socket.data.micOn =
          typeof data.micOn === "boolean"
            ? data.micOn
            : true;

        socket.data.isScreenSharing =
          typeof data.isScreenSharing === "boolean"
            ? data.isScreenSharing
            : false;

        socket.data.userId = userId;
        socket.data.userName = userName || "Guest";
        socket.data.roomId = roomId;

        console.log("JOIN MEDIA STATE:", {
          userName: socket.data.userName,
          socketId: socket.id,
          cameraOn: socket.data.cameraOn,
          micOn: socket.data.micOn,
          isScreenSharing: socket.data.isScreenSharing,
        });

        // Get existing participants before adding the new socket.
        const participants: Participant[] = Array.from(
          io.sockets.adapter.rooms.get(roomId) ?? []
        )
          .filter((socketId) => socketId !== socket.id)
          .map((socketId) => {
            const participantSocket =
              io.sockets.sockets.get(socketId);

            return {
              socketId,
              userId:
                (participantSocket?.data.userId as string) || "",
              userName:
                (participantSocket?.data.userName as string) ||
                "Guest",
              cameraOn:
                typeof participantSocket?.data.cameraOn === "boolean"
                  ? participantSocket.data.cameraOn
                  : true,
              micOn:
                typeof participantSocket?.data.micOn === "boolean"
                  ? participantSocket.data.micOn
                  : true,
              isScreenSharing:
                participantSocket?.data.isScreenSharing === true,
            };
          });

        await socket.join(roomId);

        // Send existing participants to the joining user.
        socket.emit("room-users", participants);

        // Notify existing participants about the joining user.
        socket.to(roomId).emit("user-joined", {
          socketId: socket.id,
          userId,
          userName: userName || "Guest",
          cameraOn: socket.data.cameraOn,
          micOn: socket.data.micOn,
          isScreenSharing: socket.data.isScreenSharing,
        });

        console.log(`${userName || "Guest"} joined room ${roomId}`);

        console.log(
          "Existing participants:",
          participants.map((participant) => participant.userName)
        );
      } catch (error) {
        console.error("Join room error:", error);

        socket.emit("room-error", {
          message: "Unable to join meeting room.",
        });
      }
    });

    // Validate that a target belongs to the same meeting room.
    const getValidTarget = (
      roomId: string,
      targetSocketId: string
    ): Socket | undefined => {
      if (
        !roomId ||
        !targetSocketId ||
        socket.data.roomId !== roomId ||
        !socket.rooms.has(roomId)
      ) {
        return undefined;
      }

      const targetSocket =
        io.sockets.sockets.get(targetSocketId);

      if (
        !targetSocket ||
        targetSocket.data.roomId !== roomId ||
        !targetSocket.rooms.has(roomId)
      ) {
        return undefined;
      }

      return targetSocket;
    };

    // Broadcast camera and screen-sharing status.
    socket.on("media-status", (data: MediaStatusData) => {
      const { roomId, cameraOn, isScreenSharing } = data;

      if (
        !roomId ||
        socket.data.roomId !== roomId ||
        !socket.rooms.has(roomId) ||
        typeof cameraOn !== "boolean" ||
        typeof isScreenSharing !== "boolean"
      ) {
        return;
      }

      socket.data.cameraOn = cameraOn;
      socket.data.isScreenSharing = isScreenSharing;

      const status = {
        roomId,
        socketId: socket.id,
        userId: socket.data.userId as string,
        userName: (socket.data.userName as string) || "Guest",
        cameraOn,
        isScreenSharing,
      };

      io.to(roomId).emit("media-status", status);

      console.log("MEDIA STATUS UPDATED:", status);
    });

    // Broadcast microphone status.
    socket.on("mic-status", (data: MicStatusData) => {
      const { roomId, micOn } = data;

      if (
        !roomId ||
        socket.data.roomId !== roomId ||
        !socket.rooms.has(roomId) ||
        typeof micOn !== "boolean"
      ) {
        return;
      }

      socket.data.micOn = micOn;

      const status = {
        roomId,
        socketId: socket.id,
        userId: socket.data.userId as string,
        userName: (socket.data.userName as string) || "Guest",
        micOn,
      };

      io.to(roomId).emit("mic-status", status);

      console.log("MIC STATUS UPDATED:", status);
    });

    // Send a chat message and notify users who are mentioned.
socket.on("send-message", async (data: ChatMessageData) => {
  const { roomId, message } = data;

  if (
    !roomId ||
    socket.data.roomId !== roomId ||
    !socket.rooms.has(roomId) ||
    typeof message !== "string"
  ) {
    return;
  }

  const trimmedMessage = message.trim();

  if (!trimmedMessage || trimmedMessage.length > 2000) {
    return;
  }

  const senderId = String(socket.data.userId);
  const senderName = String(socket.data.userName || "Guest");

  // Deliver the chat message immediately.
  io.to(roomId).emit("receive-message", {
    id: `${socket.id}-${Date.now()}`,
    senderSocketId: socket.id,
    senderUserId: senderId,
    senderName,
    message: trimmedMessage,
    createdAt: new Date().toISOString(),
  });

  // Process mentions separately so notification failures
  // do not interrupt normal chat delivery.
  try {
    const meeting = await Meeting.findById(roomId).select(
      "title createdBy participants"
    );

    if (!meeting) return;

    const memberIds = [
      meeting.createdBy.toString(),
      ...meeting.participants.map((id) => id.toString()),
    ];

    const uniqueMemberIds = [...new Set(memberIds)];

    const members = await User.find({
      _id: { $in: uniqueMemberIds },
    }).select("name email");

    const mentionedUsers = members.filter((member) => {
      if (member._id.toString() === senderId || !member.name) {
        return false;
      }

      return trimmedMessage
        .toLowerCase()
        .includes(`@${member.name.toLowerCase()}`);
    });

    // Avoid duplicate notifications for the same recipient.
    const notifiedUserIds = new Set<string>();

    for (const mentionedUser of mentionedUsers) {
      const recipientId = mentionedUser._id.toString();

      if (notifiedUserIds.has(recipientId)) continue;
      notifiedUserIds.add(recipientId);

      const notification = await Notification.create({
        recipient: mentionedUser._id,
        sender: senderId,
        type: "mention",
        title: `${senderName} mentioned you`,
        message: `You were mentioned in a meeting chat: "${trimmedMessage.slice(0, 150)}"`,
        relatedMeeting: meeting._id,
      });

      const populatedNotification = await Notification.findById(
        notification._id
      ).populate("sender", "name email");

      if (populatedNotification) {
        io.to(`user:${recipientId}`).emit(
          "new-notification",
          populatedNotification
        );
      }
    }
  } catch (error) {
    console.error("Mention notification error:", error);
  }
});

    // Typing started.
    socket.on("typing-start", (data: TypingData) => {
      const { roomId } = data;

      if (
        !roomId ||
        socket.data.roomId !== roomId ||
        !socket.rooms.has(roomId)
      ) {
        return;
      }

      socket.to(roomId).emit("user-typing", {
        socketId: socket.id,
        userId: socket.data.userId,
        userName: socket.data.userName || "Guest",
      });
    });

    // Typing stopped.
    socket.on("typing-stop", (data: TypingData) => {
      const { roomId } = data;

      if (
        !roomId ||
        socket.data.roomId !== roomId ||
        !socket.rooms.has(roomId)
      ) {
        return;
      }

      socket.to(roomId).emit("user-stopped-typing", {
        socketId: socket.id,
      });
    });

    // WebRTC offer relay.
    socket.on("offer", (data: SignalData) => {
      const targetSocket = getValidTarget(
        data.roomId,
        data.targetSocketId
      );

      if (!targetSocket) {
        console.warn("Offer rejected: invalid target", {
          sender: socket.id,
          target: data.targetSocketId,
          roomId: data.roomId,
        });
        return;
      }

      targetSocket.emit("offer", {
        signal: data.signal,
        senderSocketId: socket.id,
        roomId: data.roomId,
      });

      console.log("OFFER RELAYED:", socket.id, "->", targetSocket.id);
    });

    // WebRTC answer relay.
    socket.on("answer", (data: SignalData) => {
      const targetSocket = getValidTarget(
        data.roomId,
        data.targetSocketId
      );

      if (!targetSocket) {
        console.warn("Answer rejected: invalid target", {
          sender: socket.id,
          target: data.targetSocketId,
          roomId: data.roomId,
        });
        return;
      }

      targetSocket.emit("answer", {
        signal: data.signal,
        senderSocketId: socket.id,
        roomId: data.roomId,
      });

      console.log("ANSWER RELAYED:", socket.id, "->", targetSocket.id);
    });

    // ICE candidate relay.
    socket.on("ice-candidate", (data: IceCandidateData) => {
      const targetSocket = getValidTarget(
        data.roomId,
        data.targetSocketId
      );

      if (!targetSocket) return;

      targetSocket.emit("ice-candidate", {
        candidate: data.candidate,
        senderSocketId: socket.id,
        roomId: data.roomId,
      });
    });

    // Leave a meeting room.
    socket.on("leave-room", async (data: LeaveRoomData) => {
      const { roomId } = data;

      if (
        !roomId ||
        socket.data.roomId !== roomId ||
        !socket.rooms.has(roomId)
      ) {
        return;
      }

      socket.to(roomId).emit("user-left", {
        socketId: socket.id,
        userId: socket.data.userId,
        userName: socket.data.userName || "Guest",
      });

      await socket.leave(roomId);

      socket.data.roomId = undefined;
      socket.data.cameraOn = true;
      socket.data.micOn = true;
      socket.data.isScreenSharing = false;

      console.log(
        `${socket.data.userName || "Guest"} left room ${roomId}`
      );
    });

    // Handle disconnect.
    socket.on("disconnect", () => {
      const roomId = socket.data.roomId as string | undefined;

      if (roomId) {
        socket.to(roomId).emit("user-left", {
          socketId: socket.id,
          userId: socket.data.userId,
          userName: socket.data.userName || "Guest",
        });

        console.log(
          `${socket.data.userName || "Guest"} disconnected from room ${roomId}`
        );
      }

      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

};

export default setupSocket;
