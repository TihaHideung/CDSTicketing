import React, { useMemo, useState } from 'react';

function truncate(text, n = 40) {
  const s = String(text || '');
  return s.length > n ? s.slice(0, n) + '…' : s || '-';
}

function typeLabel(catAlarm) {
  return catAlarm === 'CellDown' ? 'Cell Down' : 'Site Down';
}

export default function TicketPreviewTable({ rows, onRowClick, compact = false, pageSize = 20 }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => [r.ticketId, r.siteId, r.siteName, r.nop].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [rows, query]);

  const displayRows = compact ? filtered.slice(0, pageSize) : filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {!compact && (
        <div className="p-4 flex items-center justify-between border-b border-slate-100">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Cari Ticket ID / Site ID / Site Name / NOP..."
            className="w-80 max-w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
          />
          <span className="text-sm text-slate-500">{filtered.length} ticket ditemukan</span>
        </div>
      )}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">Ticket ID</th>
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">Tipe</th>
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">Site ID</th>
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">Site Name</th>
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">NOP</th>
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">Site Class</th>
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">Duration</th>
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">RC</th>
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">PIC</th>
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">Detail</th>
              <th className="text-left font-medium px-4 py-2 whitespace-nowrap">Action Plan</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => (
              <tr
                key={r._key}
                onClick={() => onRowClick(r)}
                className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
              >
                <td className="px-4 py-2 font-medium text-navy-900 whitespace-nowrap">{r.ticketId}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {r.catAlarm === 'CellDown' ? (
                    <span className="inline-block px-2 py-0.5 rounded bg-red-50 text-brand-red font-medium">
                      {typeLabel(r.catAlarm)}
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded bg-sky-50 text-sky-600 font-medium">
                      {typeLabel(r.catAlarm)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{r.siteId}</td>
                <td className="px-4 py-2 whitespace-nowrap">{truncate(r.siteName, 24)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{r.nop}</td>
                <td className="px-4 py-2 whitespace-nowrap">{r.siteClass}</td>
                <td className="px-4 py-2 whitespace-nowrap">{r.duration}</td>
                <td className="px-4 py-2 whitespace-nowrap">{r.rc}</td>
                <td className="px-4 py-2 whitespace-nowrap">{r.pic}</td>
                <td className="px-4 py-2 max-w-[160px]">{truncate(r.detail)}</td>
                <td className="px-4 py-2 max-w-[160px]">{truncate(r.actionPlan)}</td>
              </tr>
            ))}
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center py-8 text-slate-400">
                  Tidak ada ticket.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {compact && filtered.length > pageSize && (
        <div className="p-3 text-center text-xs text-slate-400 border-t border-slate-100">
          Menampilkan {pageSize} dari {filtered.length} ticket — buka halaman "Detail Ticket Active" untuk lihat
          semua.
        </div>
      )}
      {!compact && (
        <div className="p-4 flex items-center justify-between text-sm text-slate-500 border-t border-slate-100">
          <span>
            Halaman {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

