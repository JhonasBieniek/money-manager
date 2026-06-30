export type TransactionListFilters = {
  description: string;
  tagIds: string[];
  month: string;
  year: string;
};

export const MONTH_OPTIONS = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
] as const;

export function getCurrentMonthYear(): { month: string; year: string } {
  const now = new Date();
  return {
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
  };
}

export function getDefaultTransactionListFilters(): TransactionListFilters {
  const { month, year } = getCurrentMonthYear();
  return {
    description: "",
    tagIds: [],
    month,
    year,
  };
}

export const EMPTY_TRANSACTION_LIST_FILTERS: TransactionListFilters =
  getDefaultTransactionListFilters();

function isDefaultMonthYear(month: string, year: string): boolean {
  const current = getCurrentMonthYear();
  return month === current.month && year === current.year;
}

export function hasActiveFilters(filters: TransactionListFilters): boolean {
  return Boolean(
    filters.description ||
      filters.tagIds.length > 0 ||
      !isDefaultMonthYear(filters.month, filters.year),
  );
}

export function filtersToSearchParams(
  filters: TransactionListFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.description.trim()) {
    params.set("description", filters.description.trim());
  }
  if (filters.month && filters.year) {
    params.set("month", filters.month);
    params.set("year", filters.year);
  }
  if (filters.tagIds.length > 0) {
    params.set("tagIds", filters.tagIds.join(","));
  }
  return params;
}

export function parseFiltersFromSearchParams(
  params: URLSearchParams,
): TransactionListFilters {
  const defaults = getDefaultTransactionListFilters();
  const tagIdsRaw = params.get("tagIds");
  const month = params.get("month");
  const year = params.get("year");

  return {
    description: params.get("description") ?? "",
    tagIds: tagIdsRaw
      ? tagIdsRaw.split(",").map((id) => id.trim()).filter(Boolean)
      : [],
    month: month ?? defaults.month,
    year: year ?? defaults.year,
  };
}

export function buildYearOptions(): number[] {
  const current = new Date().getFullYear();
  return [current - 2, current - 1, current, current + 1];
}

export function formatFilterPeriodLabel(month: string, year: string): string {
  const monthLabel =
    MONTH_OPTIONS.find((option) => option.value === month)?.label ?? month;
  return `${monthLabel} de ${year}`;
}
