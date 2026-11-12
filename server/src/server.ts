
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";

import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import meetingRoutes from "./routes/meetingRoutes.js";
import setupSocket from "./socket/socket.js";
import jwt from "jsonwebtoken";
import transcriptionRoutes from "./routes/transcriptionRoutes.js";
import summaryRoutes from "./routes/summaryRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 5000;

// Allowed frontend origins
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
].filter((origin): origin is string => Boolean(origin));

// Shared CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
};

// Socket.IO signaling server
const io = new Server(httpServer, {
  cors: corsOptions,
});

app.set("io", io);

// Authenticate every Socket.IO connection using JWT
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const secret = process.env.JWT_SECRET;

  if (!token || !secret) {
    return next(new Error("Authentication required"));
  }

  try {
    const decoded = jwt.verify(token, secret) as {
      userId: string;
    };

    if (!decoded.userId) {
      return next(new Error("Invalid authentication token"));
    }

    socket.data.userId = decoded.userId;

    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
});

setupSocket(io);

// Express middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/transcriptions", transcriptionRoutes);
app.use("/api/summaries", summaryRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/notifications", notificationRoutes);

// Health check route
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "IntellMeet API is running",
  });
});

// Socket.IO connection
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Start server after database connection
const startServer = async (): Promise<void> => {
  try {
    await connectDB();

    httpServer.listen(PORT, () => {
      console.log(`IntellMeet server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start IntellMeet server:", error);
    process.exit(1);
  }
};

startServer();
