
import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";

import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from "../controllers/notificationController.js";

const router = Router();

router.use(protect);

router.get("/", getNotifications);

router.put("/read-all", markAllNotificationsAsRead);

router.put("/:notificationId/read", markNotificationAsRead);

router.delete("/:notificationId", deleteNotification);

export default router;
