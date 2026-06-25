import { z } from "zod";

export const dashboardSummaryQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export const dashboardHistoryQuerySchema = z.object({
  period: z.enum(["3", "6", "12"]).default("3"),
});

export type DashboardSummaryQuery = z.infer<typeof dashboardSummaryQuerySchema>;
export type DashboardHistoryQuery = z.infer<typeof dashboardHistoryQuerySchema>;
