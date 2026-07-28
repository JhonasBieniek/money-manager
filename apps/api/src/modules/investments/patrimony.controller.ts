import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import * as patrimonyService from "./patrimony.service.js";

export async function getSummary(req: Request, res: Response): Promise<void> {
  const summary = await patrimonyService.getPatrimonySummary(getUserId(req));
  res.status(200).json(summary);
}
