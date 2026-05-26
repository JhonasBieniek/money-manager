import { describe, expect, it } from "vitest";
import {
  dateInputToIso,
  formatOccurredAtPtBr,
  isoToDateInput,
  normalizeOccurredAtDate,
  parseCalendarDateString,
} from "./date.js";

describe("parseCalendarDateString", () => {
  it("interpreta YYYY-MM-DD no calendário local (não UTC midnight)", () => {
    const d = parseCalendarDateString("2026-05-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(12);
  });

  it("corrige ISO legado em meia-noite UTC", () => {
    const d = parseCalendarDateString("2026-05-01T00:00:00.000Z");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(1);
  });
});

describe("dateInputToIso / isoToDateInput", () => {
  it("mantém o mesmo dia no input após ida e volta", () => {
    const iso = dateInputToIso("2026-05-01");
    expect(isoToDateInput(iso)).toBe("2026-05-01");
  });
});

describe("normalizeOccurredAtDate", () => {
  it("ajusta Date lido do banco em UTC midnight", () => {
    const legacy = new Date("2026-05-01T00:00:00.000Z");
    const fixed = normalizeOccurredAtDate(legacy);
    expect(fixed.getFullYear()).toBe(2026);
    expect(fixed.getMonth()).toBe(4);
    expect(fixed.getDate()).toBe(1);
  });
});

describe("formatOccurredAtPtBr", () => {
  it("formata o dia correto para ISO legado UTC midnight", () => {
    expect(formatOccurredAtPtBr("2026-05-01T00:00:00.000Z")).toMatch(/01/);
    expect(formatOccurredAtPtBr("2026-05-01T00:00:00.000Z")).toMatch(/mai/i);
  });
});
