
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import meetingRoutes from "./routes/meetingRoutes.js";
import setupSocket from "./socket/socket.js";
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
  "https://intelmeet-frontend.onrender.com",
  "http://localhost:5173",
].filter((origin): origin is string => Boolean(origin))
  .map((origin) => origin.replace(/\/$/, ""));

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error("CORS blocked origin:", origin);
      callback(new Error("Origin not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
};

// Express middleware
app.use(cors(corsOptions));

// Explicitly handle preflight requests (Express 5 compatible)
app.options(/.*/, cors(corsOptions));

app.use(helmet());
app.use(express.json());

// Socket.IO signaling server
const io = new Server(httpServer, {
  cors: corsOptions,
});

app.set("io", io);

// Authenticate Socket.IO connections using JWT
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

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/transcriptions", transcriptionRoutes);
app.use("/api/summaries", summaryRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/notifications", notificationRoutes);

// Health check
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "IntellMeet API is running",
  });
});

// Socket connection logs
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
      console.log("Allowed CORS origins:", allowedOrigins);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
