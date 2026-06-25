import { z } from "zod";

/** Normaliza query param único, repetido ou CSV em array de UUIDs. */
export function uuidArrayQueryParam() {
  return z.preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return val;
  }, z.array(z.string().uuid()).optional());
}
