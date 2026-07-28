import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import { refreshAllRvHoldingsForUser } from "./pricing/quote-refresh.service.js";

export async function refreshAllQuotes(
  req: Request,
  res: Response,
): Promise<void> {
  await refreshAllRvHoldingsForUser(getUserId(req));
  res.status(204).send();
}
