import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Globe, Search } from 'lucide-react';
import { COUNTRY_OPTIONS, POPULAR_COUNTRY_CODES } from '../lib/countries';
import { FlagMode } from '../types/vpn';
import { CountryFlag } from './CountryFlag';

export interface SelectableCountry {
  id?: string;
  code: string;
  name: string;
  keywords?: string;
  flagMode?: FlagMode;
  flagDataUrl?: string;
}

interface CountrySelectProps {
  value: string;
  countries?: SelectableCountry[];
  onChange: (country: SelectableCountry) => void;
  error?: string;
  disabled?: boolean;
}

export function CountrySelect({
  value,
  countries,
  onChange,
  error,
  disabled = false,
}: CountrySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const countryList = useMemo<SelectableCountry[]>(() => {
    if (countries && countries.length > 0) {
      return countries;
    }
    return COUNTRY_OPTIONS.map((c) => ({
      ...c,
      flagMode: 'preset' as const,
      flagDataUrl: '',
    }));
  }, [countries]);

  const selectedCountry = useMemo(
    () =>
      countryList.find((c) => (c.id && c.id === value) || c.code === value || c.name === value) ??
      null,
    [countryList, value]
  );

  const popularCountries = useMemo(
    () =>
      POPULAR_COUNTRY_CODES.map((code) => countryList.find((c) => c.code === code)).filter(
        (c): c is SelectableCountry => Boolean(c)
      ),
    [countryList]
  );

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return countryList;
    return countryList.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.keywords ? c.keywords.toLowerCase().includes(q) : false)
    );
  }, [countryList, search]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 30);

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (country: SelectableCountry) => {
    onChange(country);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor="portal-country-trigger"
        className="mb-2 block text-xs font-semibold tracking-wider text-violet-200/80"
      >
        Country
      </label>

      <button
        id="portal-country-trigger"
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        data-open={isOpen ? 'true' : 'false'}
        data-invalid={error ? 'true' : 'false'}
        onClick={() => setIsOpen((prev) => !prev)}
        className="portal-input-box flex min-h-[58px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="flex min-w-0 items-center gap-3.5">
          {selectedCountry ? (
            <>
              <CountryFlag
                countryName={selectedCountry.name}
                countryCode={selectedCountry.code}
                flagMode={selectedCountry.flagMode ?? 'preset'}
                flagDataUrl={selectedCountry.flagDataUrl}
                size="md"
              />
              <span className="truncate text-base font-medium text-white">
                {selectedCountry.name}
              </span>
            </>
          ) : (
            <>
              <span className="flex h-7 w-11 shrink-0 items-center justify-center rounded-md border border-violet-500/25 bg-violet-950/40 text-violet-300">
                <Globe className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="truncate text-base text-slate-400">Select Country</span>
            </>
          )}
        </div>

        <ChevronDown
          className={`h-5 w-5 shrink-0 text-violet-300 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {error && <p className="mt-1.5 text-xs text-rose-400">{error}</p>}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-violet-500/35 bg-[#0D0A18]/98 shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_30px_rgba(124,58,237,0.2)] backdrop-blur-xl"
          >
            {/* Search Input */}
            <div className="border-b border-white/[0.08] p-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-300/70"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredCountries.length > 0) {
                      e.preventDefault();
                      handleSelect(filteredCountries[0]);
                    }
                  }}
                  placeholder="Search country..."
                  aria-label="Search country"
                  className="min-h-[42px] w-full rounded-xl border border-violet-500/25 bg-[#06050B] pl-10 pr-3.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Scrollable Country Options */}
            <div role="listbox" aria-label="Countries" className="max-h-64 overflow-y-auto p-2">
              {!search.trim() && popularCountries.length > 0 && (
                <div className="mb-2 border-b border-white/[0.06] pb-2">
                  <p className="px-2.5 py-1 text-[11px] font-medium text-slate-400">
                    Popular Locations
                  </p>
                  {popularCountries.map((country) => {
                    const key = country.id ?? country.code;
                    const isSelected = selectedCountry
                      ? (selectedCountry.id ?? selectedCountry.code) === key
                      : false;
                    return (
                      <button
                        key={`pop_${key}`}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(country)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                          isSelected
                            ? 'bg-violet-600/25 text-white'
                            : 'text-slate-200 hover:bg-violet-500/15 hover:text-white'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <CountryFlag
                            countryName={country.name}
                            countryCode={country.code}
                            flagMode={country.flagMode ?? 'preset'}
                            flagDataUrl={country.flagDataUrl}
                            size="sm"
                          />
                          <span className="truncate font-medium">{country.name}</span>
                        </span>
                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0 text-violet-400" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredCountries.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-400">
                  No matching countries found
                </div>
              ) : (
                <div>
                  {!search.trim() && (
                    <p className="px-2.5 py-1 text-[11px] font-medium text-slate-400">
                      All Countries
                    </p>
                  )}
                  {filteredCountries.map((country) => {
                    const key = country.id ?? country.code;
                    const isSelected = selectedCountry
                      ? (selectedCountry.id ?? selectedCountry.code) === key
                      : false;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(country)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                          isSelected
                            ? 'bg-violet-600/25 text-white'
                            : 'text-slate-200 hover:bg-violet-500/15 hover:text-white'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <CountryFlag
                            countryName={country.name}
                            countryCode={country.code}
                            flagMode={country.flagMode ?? 'preset'}
                            flagDataUrl={country.flagDataUrl}
                            size="sm"
                          />
                          <span className="truncate">{country.name}</span>
                        </span>
                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0 text-violet-400" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
