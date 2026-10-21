import * as XLSX from 'xlsx';

const TARGET_WEEKS = new Set(['W32', 'W33', 'W34', 'W35', 'W36', 'W37', 'W38']);
const REGIONAL_BY_NOP = {
  'NOP BANDA ACEH': 'Sumbagut',
  'NOP BINJAI': 'Sumbagut',
  'NOP MEDAN': 'Sumbagut',
  'NOP PADANG SIDEMPUAN': 'Sumbagut',
  'NOP PEMATANG SIANTAR': 'Sumbagut',
  'NOP RANTAU PRAPAT': 'Sumbagut',
  'NOP BATAM': 'Sumbagteng',
  'NOP BUKITTINGGI': 'Sumbagteng',
  'NOP DUMAI': 'Sumbagteng',
  'NOP PADANG': 'Sumbagteng',
  'NOP PEKANBARU': 'Sumbagteng',
  'NOP BENGKULU': 'Sumbagsel',
  'NOP JAMBI': 'Sumbagsel',
  'NOP LAMPUNG': 'Sumbagsel',
  'NOP PALEMBANG': 'Sumbagsel',
  'NOP PANGKAL PINANG': 'Sumbagsel',
};

function excelDateToKey(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const serial = Number(value);
  if (!Number.isFinite(serial)) return '';
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000).toISOString().slice(0, 10);
}

function numericValue(value) {
  if (value === '' || value == null) return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`Angka trend tidak valid: ${value}`);
  return number;
}

export function parseTrendCountWorkbook(workbook) {
  const sheet = workbook.Sheets['Daily to Weekly'];
  if (!sheet) throw new Error('Sheet "Daily to Weekly" tidak ditemukan di workbook.');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  const headerIndex = rows.findIndex((row) => row.some((value) => String(value).trim() === 'Date') && row.some((value) => String(value).trim() === 'WEEK Tsel'));
  if (headerIndex < 0) throw new Error('Header Date dan WEEK Tsel tidak ditemukan di sheet "Daily to Weekly".');

  const headers = rows[headerIndex];
  const dateIndex = headers.findIndex((value) => String(value).trim() === 'Date');
  const weekIndex = headers.findIndex((value) => String(value).trim() === 'WEEK Tsel');
  const nopColumns = headers
    .map((value, index) => ({ nop: String(value).trim(), index }))
    .filter(({ nop, index }) => index > dateIndex && index < weekIndex && nop.startsWith('NOP '));

  if (!nopColumns.length || nopColumns.some(({ nop }) => !REGIONAL_BY_NOP[nop])) {
    throw new Error('Kolom NOP di sheet "Daily to Weekly" tidak sesuai dengan format yang didukung.');
  }

  const entriesByDate = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    const week = String(row[weekIndex] || '').trim().toUpperCase();
    if (!TARGET_WEEKS.has(week)) continue;

    const date = excelDateToKey(row[dateIndex]);
    if (!date) continue;
    if (entriesByDate.has(date)) throw new Error(`Tanggal ${date} muncul lebih dari satu kali di sheet harian.`);

    const byRegional = {
      Sumbagut: { cellDown: 0, siteDown: 0, total: 0 },
      Sumbagteng: { cellDown: 0, siteDown: 0, total: 0 },
      Sumbagsel: { cellDown: 0, siteDown: 0, total: 0 },
    };
    const breakdown = nopColumns.map(({ nop, index }) => {
      const regional = REGIONAL_BY_NOP[nop];
      const count = numericValue(row[index]);
      byRegional[regional].cellDown += count;
      byRegional[regional].total += count;
      return { regional, nop, catAlarm: 'CellDown', duration: 'OVER_24H', count, totalOnly: true };
    });
    const totalCount = breakdown.reduce((sum, item) => sum + item.count, 0);

    entriesByDate.set(date, {
      date,
      byRegional,
      total: { cellDown: totalCount, siteDown: 0, total: totalCount },
      breakdown,
    });
  }

  const entries = [...entriesByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!entries.length) throw new Error('Tidak ada data harian W32 sampai W38 yang bisa diimpor.');
  return entries;
}

export async function readTrendCountFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return parseTrendCountWorkbook(workbook);
}