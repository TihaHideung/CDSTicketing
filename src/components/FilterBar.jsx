import React, { useMemo, useState, useEffect, useRef } from 'react';
import { REGIONS, RC_CATEGORIES, RC_UNDER_REVIEW, DURATION_BUCKETS, getSubcategoriesFor } from '../lib/constants.js';

export const ALL_KEY = 'ALL';
export const UNSET_KEY = 'UNSET'; // representasi "(Belum diisi)" untuk filter RC

function Select({ label, value, options, onChange, allLabel, disabled, compact = false, wide = false, className = '' }) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${className}`}
      >
        <option value={ALL_KEY}>{allLabel || `Semua ${label}`}</option>
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>
            {o.label ?? o}
          </option>
        ))}
      </select>
    </div>
  );
}

// Dropdown multi-pilih (checkbox) — dipakai buat filter Duration supaya bisa pilih
// beberapa rentang sekaligus (mis. "<12H", "12H-24H", ">7 Days" bareng-bareng).
function MultiSelect({ label, values, options, onChange, allLabel }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleValue = (val) => {
    if (values.includes(val)) onChange(values.filter((v) => v !== val));
    else onChange([...values, val]);
  };

  const displayText = values.length === 0 ? allLabel || `Semua ${label}` : values.join(', ');

  return (
    <div className="min-w-0 relative" ref={boxRef}>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-10 w-full truncate rounded-lg border border-slate-200 bg-white px-2.5 text-left text-sm text-slate-700 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
        title={displayText}
      >
        {displayText}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={values.includes(opt)}
                onChange={() => toggleValue(opt)}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              {opt}
            </label>
          ))}
          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-slate-400 hover:text-slate-600"
            >
              Bersihkan pilihan
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function FilterBar({
  regionalFilter,
  onRegionalChange,
  nopFilter,
  onNopChange,
  nopOptions,
  clusterFilter,
  onClusterChange,
  clusterOptions,
  categoryFilter,
  onCategoryChange,
  durationFilter,
  onDurationChange,
  rcFilter,
  onRcChange,
  rcSubFilter,
  onRcSubChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  showDateFilter = true,
}) {
  const rcSubOptions = useMemo(() => {
    if (rcFilter === ALL_KEY || rcFilter === UNSET_KEY) return [];
    return getSubcategoriesFor(rcFilter);
  }, [rcFilter]);

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50/80 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-sm">
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-10">
        <div className="md:col-span-2">
          <Select label="Regional" value={regionalFilter} options={REGIONS} onChange={onRegionalChange} />
        </div>
        <div className="md:col-span-2">
          <Select label="NOP" value={nopFilter} options={nopOptions} onChange={onNopChange} />
        </div>
        <div className="md:col-span-2">
          <Select label="Cluster" value={clusterFilter} options={clusterOptions} onChange={onClusterChange} />
        </div>
        <div className="md:col-span-2">
          <Select
            label="Tipe"
            value={categoryFilter}
            options={[
              { value: 'CellDown', label: 'Cell Down' },
              { value: 'SiteDown', label: 'Site Down' },
            ]}
            onChange={onCategoryChange}
            allLabel="Semua Tipe"
          />
        </div>
        <div className="md:col-span-2">
          <MultiSelect
            label="Duration"
            values={durationFilter}
            options={DURATION_BUCKETS}
            onChange={onDurationChange}
            allLabel="Semua Duration"
          />
        </div>

        <div className="md:col-span-2">
          <Select
            label="RC Category"
            value={rcFilter}
            options={[{ value: UNSET_KEY, label: `(${RC_UNDER_REVIEW})` }, ...RC_CATEGORIES]}
            onChange={(val) => { onRcChange(val); onRcSubChange(ALL_KEY); }}
            allLabel="Semua RC Category"
          />
        </div>
        <div className="md:col-span-2">
          <Select
            label="RC Subcategory"
            value={rcSubFilter}
            options={rcSubOptions}
            onChange={onRcSubChange}
            allLabel={rcSubOptions.length ? 'Semua Subcategory' : 'Pilih RC Category dulu'}
            disabled={rcSubOptions.length === 0}
          />
        </div>
        {showDateFilter && (
          <>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Tanggal mulai</label>
              <input
                type="date"
                value={dateFrom || ''}
                onChange={(e) => onDateFromChange?.(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Tanggal selesai</label>
              <input
                type="date"
                value={dateTo || ''}
                onChange={(e) => onDateToChange?.(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
