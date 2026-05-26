const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const UTC_MIDNIGHT =
  /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.\d{1,3})?Z$/;

/**
 * Interpreta uma data de calendário (input type="date" ou ISO legado em UTC 00:00)
 * no fuso local, com meio-dia para evitar mudança de dia ao serializar.
 */
export function parseCalendarDateString(value: string): Date {
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  const utcMidnight = UTC_MIDNIGHT.exec(value);
  if (utcMidnight) {
    const [y, m, d] = utcMidnight[1].split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date");
  }
  return parsed;
}

/** Corrige registros antigos salvos como meia-noite UTC (dia anterior no Brasil). */
export function normalizeOccurredAtDate(date: Date): Date {
  if (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  ) {
    return new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      12,
      0,
      0,
      0
    );
  }
  return date;
}

export function parseOccurredAt(input?: string): Date {
  if (!input) return new Date();
  return normalizeOccurredAtDate(parseCalendarDateString(input));
}

export function toCalendarDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Valor do input date → ISO para a API. */
export function dateInputToIso(dateInput: string): string {
  return parseCalendarDateString(dateInput).toISOString();
}

/** ISO da API → valor do input date. */
export function isoToDateInput(iso: string): string {
  return toCalendarDateInput(parseCalendarDateString(iso));
}

export function formatOccurredAtPtBr(iso: string): string {
  const date = parseCalendarDateString(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

export function localDayRangeFromDateInput(dateInput: string): {
  start: Date;
  end: Date;
} {
  const [y, m, d] = dateInput.split("-").map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0),
    end: new Date(y, m - 1, d, 23, 59, 59, 999),
  };
}

export function localMonthRange(
  year: number,
  month: number
): { start: Date; end: Date } {
  return {
    start: new Date(year, month - 1, 1, 0, 0, 0, 0),
    end: new Date(year, month, 0, 23, 59, 59, 999),
  };
}

export function nowUtc(): Date {
  return new Date();
}

export function toIsoUtc(date: Date): string {
  return date.toISOString();
}

export function parseIsoUtc(iso: string): Date {
  return parseCalendarDateString(iso);
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
