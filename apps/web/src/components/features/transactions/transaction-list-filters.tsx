import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SearchableMultiSelect } from "../../ui/searchable-select";
import { FilterSelect } from "../../ui/filter-select";
import { apiFetch } from "../../../lib/api";
import { useSelectedPeriod } from "../../../contexts/period-context";
import {
  EMPTY_TRANSACTION_LIST_FILTERS,
  MONTH_OPTIONS,
  buildYearOptions,
  filtersToSearchParams,
  hasActiveFilters,
  parseFiltersFromSearchParams,
  type TransactionListFilters,
} from "../../../lib/transaction-list-filters";
import { Calendar as CalendarIcon, Search, X } from "lucide-react";

type TagOption = { id: string; name: string };

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function TransactionListFiltersBar({
  onFiltersChange,
}: {
  onFiltersChange: (filters: TransactionListFilters) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { month: sharedMonth, year: sharedYear, setPeriod, resetPeriod } =
    useSelectedPeriod();

  const [filters, setFilters] = useState<TransactionListFilters>(() =>
    parseFiltersFromSearchParams(searchParams, {
      month: sharedMonth,
      year: sharedYear,
    }),
  );
  const [tags, setTags] = useState<TagOption[]>([]);

  const debouncedDescription = useDebouncedValue(filters.description, 300);
  const debouncedFilters = useMemo(
    () => ({ ...filters, description: debouncedDescription }),
    [filters, debouncedDescription],
  );

  const tagOptions = useMemo(
    () => tags.map((t) => ({ value: t.id, label: t.name })),
    [tags],
  );

  const yearOptions = useMemo(
    () =>
      buildYearOptions().map((year) => ({
        value: String(year),
        label: String(year),
      })),
    [],
  );

  const monthOptions = useMemo(
    () =>
      MONTH_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    [],
  );

  const syncUrl = useCallback(
    (next: TransactionListFilters) => {
      const params = filtersToSearchParams(next);
      const query = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: query ? `?${query}` : "",
        },
        { replace: true },
      );
    },
    [location.pathname, navigate],
  );

  useEffect(() => {
    onFiltersChange(debouncedFilters);
    syncUrl(debouncedFilters);
  }, [debouncedFilters, onFiltersChange, syncUrl]);

  useEffect(() => {
    async function loadTags() {
      try {
        const res = await apiFetch("/v1/tags");
        if (res.ok) {
          const data = (await res.json()) as { items: TagOption[] };
          setTags(data.items ?? []);
        }
      } catch {
        // ignore
      }
    }
    void loadTags();
  }, []);

  function updateFilters(patch: Partial<TransactionListFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function resetFilters() {
    setFilters(EMPTY_TRANSACTION_LIST_FILTERS);
    resetPeriod();
  }

  const active = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="group relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-white" />
          <input
            type="text"
            placeholder="Buscar por descrição..."
            value={filters.description}
            onChange={(e) => updateFilters({ description: e.target.value })}
            className="h-12 w-full rounded-2xl border border-white/5 bg-white/5 pl-12 pr-4 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:bg-white/10 focus:ring-1 focus:ring-emerald-500/50 sm:h-14"
          />
        </div>

        <div className="flex h-12 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-2xl border border-white/5 bg-white/5 px-3 transition-colors focus-within:border-emerald-500/30 focus-within:bg-white/[0.07] sm:h-14 sm:gap-3 sm:px-4">
          <CalendarIcon className="h-4 w-4 shrink-0 text-zinc-500" />
          <FilterSelect
            value={filters.month}
            onChange={(month) => {
              updateFilters({ month });
              setPeriod(month, filters.year);
            }}
            options={monthOptions}
            ariaLabel="Mês"
          />
          <span className="text-zinc-700">/</span>
          <FilterSelect
            value={filters.year}
            onChange={(year) => {
              updateFilters({ year });
              setPeriod(filters.month, year);
            }}
            options={yearOptions}
            ariaLabel="Ano"
            className="max-w-[5.5rem]"
          />
        </div>

        {active ? (
          <button
            type="button"
            onClick={resetFilters}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-500/10 bg-red-500/10 text-red-400 transition-all hover:bg-red-500/20 active:scale-95 sm:h-14 sm:w-14"
            aria-label="Limpar filtros"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <SearchableMultiSelect
        options={tagOptions}
        value={filters.tagIds}
        onChange={(tagIds) => updateFilters({ tagIds })}
        placeholder="Filtrar por tags..."
        emptyMessage="Nenhuma tag encontrada"
      />
    </div>
  );
}
