import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export interface DialCodeOption {
  phoneCode: string;   // e.g. "+254" — also used as the value
  countries: string;   // e.g. "United States / Canada"
}

interface DialCodeSelectProps {
  value: string;
  options: DialCodeOption[];
  onChange: (phoneCode: string) => void;
  className?: string;  // applied to the closed trigger button
  id?: string;
}

/**
 * Searchable dial-code picker. The closed control shows just the dial code so it
 * stays compact, while the open dropdown lets the user type to filter by country
 * name or code (native <select> can only match the start of the option text).
 */
const DialCodeSelect: React.FC<DialCodeSelectProps> = ({
  value,
  options,
  onChange,
  className = '',
  id,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.countries.toLowerCase().includes(q) || o.phoneCode.includes(q),
    );
  }, [query, options]);

  // Reset search + highlight the current value each time the dropdown opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const idx = options.findIndex((o) => o.phoneCode === value);
    setActiveIndex(idx >= 0 ? idx : 0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open, options, value]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!open) return;
    (listRef.current?.children[activeIndex] as HTMLElement | undefined)?.scrollIntoView({
      block: 'nearest',
    });
  }, [activeIndex, open]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) choose(opt.phoneCode);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${className} flex items-center justify-between gap-1`}
      >
        <span className="truncate">{value || 'Code'}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-64 max-w-[80vw] bg-white border border-slate-200 rounded-lg shadow-xl">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search country or code…"
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
              />
            </div>
          </div>
          <ul ref={listRef} role="listbox" className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-400">No matches</li>
            )}
            {filtered.map((o, i) => (
              <li
                key={o.phoneCode}
                role="option"
                aria-selected={o.phoneCode === value}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(o.phoneCode)}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-3 ${
                  i === activeIndex ? 'bg-blue-50' : ''
                } ${o.phoneCode === value ? 'font-semibold text-primary' : 'text-slate-700'}`}
              >
                <span className="truncate">{o.countries}</span>
                <span className="shrink-0 text-slate-400">{o.phoneCode}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default DialCodeSelect;
