export interface BillingCyclePeriod {
  cycleYear: number;
  cycleMonth: number;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, lastDayOfMonth(year, month));
}

/** Data de calendário local ao meio-dia (mesmo padrão de date.ts). */
export function calendarDate(
  year: number,
  month: number,
  day: number,
): Date {
  const clamped = clampDay(year, month, day);
  return new Date(year, month - 1, clamped, 12, 0, 0, 0);
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateString(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return calendarDate(y, m, d);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Se cair em sábado/domingo, retrocede para a sexta anterior. */
export function adjustToBusinessDay(date: Date): Date {
  const adjusted = new Date(date);
  const weekday = adjusted.getDay();
  if (weekday === 6) {
    adjusted.setDate(adjusted.getDate() - 1);
  } else if (weekday === 0) {
    adjusted.setDate(adjusted.getDate() - 2);
  }
  return adjusted;
}

export function computeNominalClosingDay(
  dueDay: number,
  offsetDays = 7,
): number {
  let closing = dueDay - offsetDays;
  while (closing <= 0) {
    closing += 31;
  }
  return closing;
}

export function computeClosingDate(
  dueYear: number,
  dueMonth: number,
  dueDay: number,
  offsetDays = 7,
): Date {
  const dueDate = calendarDate(dueYear, dueMonth, dueDay);
  const rawClosing = addDays(dueDate, -offsetDays);
  return adjustToBusinessDay(rawClosing);
}

function previousDueMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

function nextDueMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  if (month === 12) {
    return { year: year + 1, month: 1 };
  }
  return { year, month: month + 1 };
}

export function computeBillingCycle(
  dueYear: number,
  dueMonth: number,
  dueDay: number,
  offsetDays = 7,
): BillingCyclePeriod {
  const dueDate = calendarDate(dueYear, dueMonth, dueDay);
  const periodEnd = computeClosingDate(dueYear, dueMonth, dueDay, offsetDays);

  const prev = previousDueMonth(dueYear, dueMonth);
  const prevPeriodEnd = computeClosingDate(
    prev.year,
    prev.month,
    dueDay,
    offsetDays,
  );
  const periodStart = addDays(prevPeriodEnd, 1);

  return {
    cycleYear: dueYear,
    cycleMonth: dueMonth,
    periodStart,
    periodEnd,
    dueDate,
  };
}

export function isDateInPeriod(
  date: Date,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  const t = calendarDate(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ).getTime();
  const start = calendarDate(
    periodStart.getFullYear(),
    periodStart.getMonth() + 1,
    periodStart.getDate(),
  ).getTime();
  const end = calendarDate(
    periodEnd.getFullYear(),
    periodEnd.getMonth() + 1,
    periodEnd.getDate(),
  ).getTime();
  return t >= start && t <= end;
}

/** Determina o ciclo natural de vencimento para uma data de compra. */
export function findBillingCycleForPurchase(
  purchaseDate: Date,
  dueDay: number,
  offsetDays = 7,
): BillingCyclePeriod {
  const y = purchaseDate.getFullYear();
  const m = purchaseDate.getMonth() + 1;

  let cycleYear = y;
  let cycleMonth = m;
  let cycle = computeBillingCycle(cycleYear, cycleMonth, dueDay, offsetDays);

  for (let guard = 0; guard < 36; guard++) {
    if (isDateInPeriod(purchaseDate, cycle.periodStart, cycle.periodEnd)) {
      return cycle;
    }

    const purchaseTime = calendarDate(
      purchaseDate.getFullYear(),
      purchaseDate.getMonth() + 1,
      purchaseDate.getDate(),
    ).getTime();
    const endTime = calendarDate(
      cycle.periodEnd.getFullYear(),
      cycle.periodEnd.getMonth() + 1,
      cycle.periodEnd.getDate(),
    ).getTime();
    const startTime = calendarDate(
      cycle.periodStart.getFullYear(),
      cycle.periodStart.getMonth() + 1,
      cycle.periodStart.getDate(),
    ).getTime();

    if (purchaseTime > endTime) {
      const next = nextDueMonth(cycleYear, cycleMonth);
      cycleYear = next.year;
      cycleMonth = next.month;
      cycle = computeBillingCycle(cycleYear, cycleMonth, dueDay, offsetDays);
      continue;
    }

    if (purchaseTime < startTime) {
      const prev = previousDueMonth(cycleYear, cycleMonth);
      cycleYear = prev.year;
      cycleMonth = prev.month;
      cycle = computeBillingCycle(cycleYear, cycleMonth, dueDay, offsetDays);
      continue;
    }

    break;
  }

  return cycle;
}

export function findCurrentBillingCycle(
  referenceDate: Date,
  dueDay: number,
  offsetDays = 7,
): BillingCyclePeriod {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth() + 1;
  const current = computeBillingCycle(y, m, dueDay, offsetDays);

  if (isDateInPeriod(referenceDate, current.periodStart, current.periodEnd)) {
    return current;
  }

  const next = nextDueMonth(y, m);
  return computeBillingCycle(next.year, next.month, dueDay, offsetDays);
}

export function nextBillingCycle(
  cycleYear: number,
  cycleMonth: number,
  dueDay: number,
  offsetDays = 7,
): BillingCyclePeriod {
  const next = nextDueMonth(cycleYear, cycleMonth);
  return computeBillingCycle(next.year, next.month, dueDay, offsetDays);
}
