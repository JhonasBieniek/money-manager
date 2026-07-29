import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import { todayBrtString } from "../investments/brt-date.js";
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

export function resolveUsageYearMonth(
  query: { year?: number; month?: number },
  now: Date,
): { year: number; month: number } {
  const [brtYear, brtMonth] = todayBrtString(now).split("-").map(Number);
  return {
    year: query.year ?? brtYear!,
    month: query.month ?? brtMonth!,
  };
}

export async function usage(req: Request, res: Response): Promise<void> {
  const query = goalUsageQuerySchema.parse(req.query);
  const { year, month } = resolveUsageYearMonth(query, new Date());
  const items = await goalsService.getGoalUsage(getUserId(req), year, month);
  res.status(200).json({ items });
}
