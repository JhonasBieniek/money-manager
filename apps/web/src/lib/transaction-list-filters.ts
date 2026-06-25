export type TransactionListFilters = {
  description: string;
  tagIds: string[];
  month: string;
  year: string;
};

export const EMPTY_TRANSACTION_LIST_FILTERS: TransactionListFilters = {
  description: "",
  tagIds: [],
  month: "",
  year: "",
};

export function hasActiveFilters(filters: TransactionListFilters): boolean {
  return Boolean(
    filters.description ||
      filters.tagIds.length > 0 ||
      filters.month ||
      filters.year,
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
  const tagIdsRaw = params.get("tagIds");
  return {
    description: params.get("description") ?? "",
    tagIds: tagIdsRaw
      ? tagIdsRaw.split(",").map((id) => id.trim()).filter(Boolean)
      : [],
    month: params.get("month") ?? "",
    year: params.get("year") ?? "",
  };
}

export function buildYearOptions(): number[] {
  const current = new Date().getFullYear();
  return [current - 2, current - 1, current, current + 1];
}
