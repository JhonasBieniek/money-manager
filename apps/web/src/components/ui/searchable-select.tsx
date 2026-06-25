import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/cn";

export type SearchableOption = {
  value: string;
  label: string;
};

function normalizeSearch(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;

    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutside();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [ref, onOutside, enabled]);
}

const inputClass =
  "w-full rounded-2xl border border-white/5 bg-white/5 px-5 py-3.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:bg-white/10 focus:ring-1 focus:ring-emerald-500/50";

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Buscar…",
  emptyMessage = "Nenhum resultado",
  required,
  disabled,
}: {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    let results = options;
    if (q) {
      results = options.filter(
        (o) =>
          normalizeSearch(o.label).includes(q) ||
          normalizeSearch(o.value).includes(q),
      );
    }
    if (selected && !results.some((o) => o.value === selected.value)) {
      results = [selected, ...results];
    }
    return results;
  }, [options, query, selected]);

  useClickOutside(rootRef, () => setOpen(false), open);

  useEffect(() => {
    if (open && selected) {
      setQuery(selected.label);
    }
  }, [open, selected]);

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          required={required && !value}
          placeholder={placeholder}
          value={open ? query : (selected?.label ?? "")}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery(selected?.label ?? "");
          }}
          className={cn(inputClass, "h-14 pr-10")}
        />
        <ChevronDown
          className={cn(
            "pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-transform",
            open && "rotate-180",
          )}
        />
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-white/10 bg-zinc-900 py-1 shadow-xl"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-2.5 text-sm text-zinc-500">{emptyMessage}</li>
          ) : (
            filtered.map((opt) => (
              <li key={opt.value} role="option" aria-selected={opt.value === value}>
                <button
                  type="button"
                  className={cn(
                    "w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/5",
                    opt.value === value
                      ? "bg-emerald-500/15 font-medium text-emerald-200"
                      : "text-zinc-200",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(opt.value);
                    setQuery(opt.label);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function SearchableMultiSelect({
  options,
  value,
  onChange,
  placeholder = "Buscar tags…",
  emptyMessage = "Nenhuma tag encontrada",
  disabled,
}: {
  options: SearchableOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOptions = useMemo(
    () => options.filter((o) => value.includes(o.value)),
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    const available = options.filter((o) => !value.includes(o.value));
    if (!q) return available;
    return available.filter((o) => normalizeSearch(o.label).includes(q));
  }, [options, query, value]);

  useClickOutside(rootRef, () => setOpen(false), open);

  function add(val: string) {
    if (!value.includes(val)) onChange([...value, val]);
    setQuery("");
  }

  function remove(val: string) {
    onChange(value.filter((id) => id !== val));
  }

  return (
    <div ref={rootRef} className="space-y-2">
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className={cn(inputClass, "h-14")}
        />
      </div>

      {selectedOptions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedOptions.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-sm font-medium text-emerald-200"
            >
              {opt.label}
              <button
                type="button"
                onClick={() => remove(opt.value)}
                className="rounded p-0.5 hover:bg-emerald-500/20"
                aria-label={`Remover ${opt.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="max-h-40 overflow-auto rounded-xl border border-white/10 bg-zinc-900 py-1 shadow-xl"
        >
          {options.length === 0 ? (
            <li className="px-4 py-2.5 text-sm text-zinc-500">
              Nenhuma tag cadastrada.{" "}
              <Link
                to="/dashboard/tags/new"
                className="text-emerald-400 hover:text-emerald-300"
              >
                Criar tag
              </Link>
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-4 py-2.5 text-sm text-zinc-500">{emptyMessage}</li>
          ) : (
            filtered.map((opt) => (
              <li key={opt.value} role="option">
                <button
                  type="button"
                  className="w-full px-4 py-2.5 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    add(opt.value);
                    setOpen(true);
                  }}
                >
                  {opt.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
