import { z } from "zod";

export const patrimonyHistoryQuerySchema = z.object({
  period: z.enum(["3", "6", "12", "24"]).transform(Number),
});

export type PatrimonyHistoryQuery = z.infer<typeof patrimonyHistoryQuerySchema>;

export const patrimonyBenchmarksQuerySchema = z.object({
  period: z.enum(["year", "12m"]),
});

export type PatrimonyBenchmarksQuery = z.infer<
  typeof patrimonyBenchmarksQuerySchema
>;
