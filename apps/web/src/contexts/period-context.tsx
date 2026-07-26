import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getCurrentMonthYear } from "../lib/transaction-list-filters";

type PeriodContextValue = {
  month: string;
  year: string;
  periodTouched: boolean;
  setPeriod: (month: string, year: string) => void;
  resetPeriod: () => void;
};

const PeriodContext = createContext<PeriodContextValue | null>(null);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const initial = getCurrentMonthYear();
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const [periodTouched, setPeriodTouched] = useState(false);

  const setPeriod = useCallback((nextMonth: string, nextYear: string) => {
    setMonth(nextMonth);
    setYear(nextYear);
    setPeriodTouched(true);
  }, []);

  const resetPeriod = useCallback(() => {
    const current = getCurrentMonthYear();
    setMonth(current.month);
    setYear(current.year);
    setPeriodTouched(false);
  }, []);

  const value = useMemo(
    () => ({ month, year, periodTouched, setPeriod, resetPeriod }),
    [month, year, periodTouched, setPeriod, resetPeriod],
  );

  return (
    <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
  );
}

export function useSelectedPeriod(): PeriodContextValue {
  const context = useContext(PeriodContext);
  if (!context) {
    throw new Error("useSelectedPeriod must be used within PeriodProvider");
  }
  return context;
}
