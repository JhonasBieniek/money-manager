import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as userController from "./user.controller.js";

export const userRoutes = Router();

userRoutes.get("/", authenticate, userController.getMe);
