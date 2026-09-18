import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { RC_CATEGORIES, PIC_OPTIONS, getSubcategoriesFor } from '../lib/constants.js';

function fmtDate(d) {
  if (!d) return '-';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('id-ID');
}

const FIELD_LABELS = [
  ['ticketId', 'Ticket ID'],
  ['catAlarm', 'Cat Alarm'],
  ['subType', 'Sub Type'],
  ['siteId', 'Site ID'],
  ['siteName', 'Site Name'],
  ['regional', 'Regional'],
  ['regionalCode', 'Regional Code (internal)'],
  ['nop', 'NOP'],
  ['cluster', 'Cluster'],
  ['siteClass', 'Site Class'],
  ['siteType', 'Site Type'],
  ['alarmName', 'Alarm Name'],
  ['alarmGroup', 'Alarm Group'],
  ['emsName', 'EMS Name'],
  ['clearanceStatus', 'Clearance Status'],
  ['duration', 'Duration'],
];

export default function TicketDetailModal({ ticket, onClose, onSave }) {
  const [rc, setRc] = useState(ticket?.rc || '');
  const [rcSub, setRcSub] = useState(ticket?.rcSub || '');
  const [pic, setPic] = useState(ticket?.pic || '');
  const [detail, setDetail] = useState(ticket?.detail || '');
  const [actionPlan, setActionPlan] = useState(ticket?.actionPlan || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRc(ticket?.rc || '');
    setRcSub(ticket?.rcSub || '');
    setPic(ticket?.pic || '');
    setDetail(ticket?.detail || '');
    setActionPlan(ticket?.actionPlan || '');
  }, [ticket]);

  const subcategoryOptions = useMemo(() => getSubcategoriesFor(rc), [rc]);

  if (!ticket) return null;

  const handleCategoryChange = (val) => {
    setRc(val);
    setRcSub(''); // reset subcategory tiap ganti kategori, karena pilihannya beda
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave({ rc, rcSub, pic, detail, actionPlan });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <h3 className="font-semibold text-slate-800">Detail Ticket — {ticket.ticketId}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Data dari Excel Merge</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {FIELD_LABELS.map(([key, label]) => (
                <div key={key} className="flex justify-between gap-3 border-b border-slate-50 py-1">
                  <span className="text-slate-500">{label}</span>
                  <span className="text-slate-800 text-right">{String(ticket[key] ?? '-') || '-'}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-b border-slate-50 py-1">
                <span className="text-slate-500">Last Occurred On</span>
                <span className="text-slate-800 text-right">{fmtDate(ticket.lastOccurredOn)}</span>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-50 py-1">
                <span className="text-slate-500">Aging</span>
                <span className="text-slate-800 text-right">{Math.round(ticket.ageDays * 10) / 10} hari</span>
              </div>
              {ticket.mergedTicketIds?.length > 1 && (
                <div className="col-span-2 flex justify-between gap-3 border-b border-slate-50 py-1">
                  <span className="text-slate-500">Ticket ID tergabung (dedup Site Down)</span>
                  <span className="text-slate-800 text-right">{ticket.mergedTicketIds.join(', ')}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Diisi Petugas</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">RC Category</label>
                  <select
                    value={rc}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
                  >
                    <option value="">(Belum dipilih)</option>
                    {RC_CATEGORIES.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">RC Subcategory</label>
                  <select
                    value={rcSub}
                    onChange={(e) => setRcSub(e.target.value)}
                    disabled={!rc}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">{rc ? '(Belum dipilih)' : 'Pilih RC Category dulu'}</option>
                    {subcategoryOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">PIC</label>
                <select
                  value={pic}
                  onChange={(e) => setPic(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
                >
                  <option value="">(Belum dipilih)</option>
                  {PIC_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Detail</label>
                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
                  placeholder="Detail temuan/kondisi di lapangan..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Action Plan</label>
                <textarea
                  value={actionPlan}
                  onChange={(e) => setActionPlan(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
                  placeholder="Rencana tindak lanjut..."
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-100">
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm bg-brand-red text-white font-medium disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
