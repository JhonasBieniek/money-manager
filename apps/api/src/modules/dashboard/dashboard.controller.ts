import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  dashboardHistoryQuerySchema,
  dashboardSummaryQuerySchema,
} from "./dashboard.schema.js";
import * as dashboardService from "./dashboard.service.js";

export async function summary(req: Request, res: Response): Promise<void> {
  const query = dashboardSummaryQuerySchema.parse(req.query);
  const now = new Date();
  const year = query.year ?? now.getFullYear();
  const month = query.month ?? now.getMonth() + 1;

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
