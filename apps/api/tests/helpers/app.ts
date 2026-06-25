import type { Express } from "express";
import { createApp } from "../../src/app.js";

export function createTestApp(): Express {
  return createApp();
}
