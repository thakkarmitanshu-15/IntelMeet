import { Router } from "express";

import {
  register,
  login,
  getMe,
  getUsers,
} from "../controllers/authController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", register);

router.post("/login", login);

router.get("/me", protect, getMe);

router.get("/users", protect, getUsers);

export default router;