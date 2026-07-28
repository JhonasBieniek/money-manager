import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import * as benchmarkService from "./benchmarks/benchmark.service.js";
import {
  patrimonyBenchmarksQuerySchema,
  patrimonyHistoryQuerySchema,
} from "./patrimony.schema.js";
import * as patrimonyService from "./patrimony.service.js";

export async function getSummary(req: Request, res: Response): Promise<void> {
  const summary = await patrimonyService.getPatrimonySummary(getUserId(req));
  res.status(200).json(summary);
}

export async function getHistory(req: Request, res: Response): Promise<void> {
  const { period } = patrimonyHistoryQuerySchema.parse(req.query);
  const items = await patrimonyService.getPatrimonyHistory(
    getUserId(req),
    period,
  );
  res.status(200).json({ items });
}

export async function registerSnapshot(
  req: Request,
  res: Response,
): Promise<void> {
  const snapshot = await patrimonyService.registerSnapshot(
    getUserId(req),
    new Date(),
  );
  res.status(200).json(snapshot);
}

export async function getBenchmarks(
  req: Request,
  res: Response,
): Promise<void> {
  const { period } = patrimonyBenchmarksQuerySchema.parse(req.query);
  const comparison = await benchmarkService.getBenchmarkComparison(
    getUserId(req),
    period,
  );
  res.status(200).json(comparison);
}
