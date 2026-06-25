import type { Request, Response } from "express";
import { UnauthorizedError } from "../../shared/errors/app-error.js";
import { getUserId } from "../../shared/types/request.js";
import * as userService from "./user.service.js";

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const profile = await userService.getUserProfile(getUserId(req));
    res.status(200).json(profile);
  } catch (err) {
    if (err instanceof Error && err.message === "Missing userId on request") {
      throw new UnauthorizedError();
    }
    throw err;
  }
}
