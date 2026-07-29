import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import { todayBrtString } from "../investments/brt-date.js";
import {
  dashboardHistoryQuerySchema,
  dashboardSummaryQuerySchema,
} from "./dashboard.schema.js";
import * as dashboardService from "./dashboard.service.js";

export function resolveSummaryYearMonth(
  query: { year?: number; month?: number },
  now: Date,
): { year: number; month: number } {
  const [brtYear, brtMonth] = todayBrtString(now).split("-").map(Number);
  return {
    year: query.year ?? brtYear!,
    month: query.month ?? brtMonth!,
  };
}

export async function summary(req: Request, res: Response): Promise<void> {
  const query = dashboardSummaryQuerySchema.parse(req.query);
  const { year, month } = resolveSummaryYearMonth(query, new Date());

  const data = await dashboardService.getDashboardSummary(
    getUserId(req),
    year,
    month,
  );
  res.status(200).json(data);
}

export async function history(req: Request, res: Response): Promise<void> {
  const query = dashboardHistoryQuerySchema.parse(req.query);
  const items = await dashboardService.getDashboardHistory(
    getUserId(req),
    parseInt(query.period, 10),
  );
  res.status(200).json({ items });
}
