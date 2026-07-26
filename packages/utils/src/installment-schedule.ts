export const INSTALLMENT_PERIODS = [
  "daily",
  "weekly",
  "monthly",
  "bimonthly",
  "quarterly",
  "semiannual",
  "yearly",
] as const;

export type InstallmentPeriod = (typeof INSTALLMENT_PERIODS)[number];

export function calendarDate(
  year: number,
  month: number,
  day: number,
): Date {
  const lastDay = new Date(year, month, 0).getDate();
  const clamped = Math.min(day, lastDay);
  return new Date(year, month - 1, clamped, 12, 0, 0, 0);
}

export function parseDateString(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return calendarDate(y, m, d);
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addInstallmentPeriod(
  date: Date,
  period: InstallmentPeriod,
  steps = 1,
): Date {
  const next = new Date(date);
  switch (period) {
    case "daily":
      next.setDate(next.getDate() + steps);
      break;
    case "weekly":
      next.setDate(next.getDate() + steps * 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + steps);
      break;
    case "bimonthly":
      next.setMonth(next.getMonth() + steps * 2);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + steps * 3);
      break;
    case "semiannual":
      next.setMonth(next.getMonth() + steps * 6);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + steps);
      break;
    default:
      next.setMonth(next.getMonth() + steps);
  }
  return next;
}

export function generateInstallmentDueDates(
  startDate: Date,
  count: number,
  period: InstallmentPeriod,
): Date[] {
  if (count < 1) {
    return [];
  }
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(addInstallmentPeriod(startDate, period, i));
  }
  return dates;
}

export function calculateDebtEndDate(
  startDate: Date,
  count: number,
  period: InstallmentPeriod,
): Date {
  if (count < 1) {
    return startDate;
  }
  return addInstallmentPeriod(startDate, period, count - 1);
}

export function isDateInMonth(
  date: Date,
  year: number,
  month: number,
): boolean {
  return date.getFullYear() === year && date.getMonth() + 1 === month;
}
