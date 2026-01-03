import express from "express";
import { register, login } from "../controllers/authController.js";

const router = express.Router();

// registration route (api/auth/register)
router.post("/register", register);

// login route (api/auth/login)
router.post("/login", login);

export default router;
