import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  goalUsageQuerySchema,
  upsertGoalsBodySchema,
} from "./goals.schema.js";
import * as goalsService from "./goals.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const items = await goalsService.listGoals(getUserId(req));
  res.status(200).json({ items });
}

export async function upsert(req: Request, res: Response): Promise<void> {
  const body = upsertGoalsBodySchema.parse(req.body);
  const items = await goalsService.upsertGoals(getUserId(req), body);
  res.status(200).json({ items });
}

export async function usage(req: Request, res: Response): Promise<void> {
  const query = goalUsageQuerySchema.parse(req.query);
  const now = new Date();
  const year = query.year ?? now.getFullYear();
  const month = query.month ?? now.getMonth() + 1;
  const items = await goalsService.getGoalUsage(getUserId(req), year, month);
  res.status(200).json({ items });
}
