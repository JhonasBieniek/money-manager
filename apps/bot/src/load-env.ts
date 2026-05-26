import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("pnpm-workspace.yaml not found (monorepo root)");
    }
    dir = parent;
  }
}

const root = findMonorepoRoot(path.dirname(fileURLToPath(import.meta.url)));

config({ path: path.join(root, ".env") });
