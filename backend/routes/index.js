import express from "express";
import Users from "../models/UserModels.js";
import { getUsers, Register, Login, Logout, requestPasswordReset, resetPassword } from "../controllers/User.js";
import { VerifyToken } from "../middleware/VerifyToken.js";
import { refreshToken } from "../controllers/RefreshToken.js";

const router = express.Router();

router.get("/users",VerifyToken, getUsers);
router.post("/users", Register);
router.post("/login", Login);
router.get("/token", refreshToken);
router.delete("/logout", Logout);
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password/:token", resetPassword);

export default router;