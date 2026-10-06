import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {
  MERGE_COLUMNS,
  MERGE_REQUIRED_HEADERS,
  SWFM_COLUMNS,
  SWFM_REQUIRED_HEADERS,
  MASTER_COLUMNS,
  MASTER_REQUIRED_HEADERS,
  NOIM_REQUIRED_HEADERS,
  HEADER_ALIASES,
  RC_CATEGORIES,
  PIC_OPTIONS,
  RC_STRUCTURE,
} from './constants.js';

export function fileSizeLabel(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

const MAX_HEADER_ROW_SCAN = 6; // sebagian file punya baris ringkasan/kosong di atas header asli

const CANONICAL_HEADER_MAP = new Map(
  Object.values({ ...MERGE_COLUMNS, ...SWFM_COLUMNS, ...MASTER_COLUMNS }).map((header) => [normalizeHeaderText(header), header])
);
// Alias header (nama kolom beda tapi isinya sama) ditambahkan setelah nama kanonis,
// supaya kalau ada bentrok, nama kanonis aslinya yang menang.
for (const [alias, canonical] of Object.entries(HEADER_ALIASES)) {
  CANONICAL_HEADER_MAP.set(normalizeHeaderText(alias), canonical);
}

function normalizeHeaderText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .toLowerCase();
}

function canonicalizeRow(row = {}) {
  const out = {};
  for (const [rawKey, value] of Object.entries(row)) {
    const canonical = CANONICAL_HEADER_MAP.get(normalizeHeaderText(rawKey)) || String(rawKey).trim();
    out[canonical] = value;
  }
  return out;
}

/**
 * Ambil nilai 1 sel, mendukung dua representasi worksheet dari SheetJS:
 * - Mode "dense" (opsi `{ dense: true }` saat baca) — worksheet-nya sendiri berupa
 *   ARRAY (`ws[baris][kolom]`), jauh lebih ringan untuk sheet raksasa (puluhan-ratusan
 *   ribu baris) dibanding mode biasa. Dipakai supaya file besar (mis. export SWFM yang
 *   bisa >100rb baris) tidak bikin browser lemot/crash.
 * - Mode biasa (per sel disimpan sebagai key "A1", "B2", dst pada object worksheet).
 */
function getCellValue(ws, r, c) {
  if (Array.isArray(ws)) {
    const row = ws[r];
    const cell = row ? row[c] : undefined;
    return cell ? cell.v : undefined;
  }
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  return cell ? cell.v : undefined;
}

/**
 * Sebuah workbook bisa punya beberapa sheet (pivot manual, catatan, dll) selain sheet
 * data mentahnya, dan baris headernya juga tidak selalu di baris pertama (kadang ada
 * baris ringkasan/kosong di atasnya). Untuk menghindari salah baca, cari sheet DAN baris
 * header yang benar-benar memuat semua kolom wajib, alih-alih asal pakai sheet & baris
 * pertama. Header juga bisa beda posisi, capitalisasi, atau ada whitespace berlebih.
 */
function findDataSheet(workbook, requiredHeaders) {
  const normalizedRequired = requiredHeaders.map(normalizeHeaderText);

  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    // Beberapa file (mis. sheet chart/dialog tersembunyi, atau workbook yang sedikit
    // rusak/dari tool lain) bisa punya nama sheet di `SheetNames` tapi datanya kosong
    // atau malah tidak ada sama sekali di `workbook.Sheets`. Skip saja, jangan crash.
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const lastRowToScan = Math.min(range.s.r + MAX_HEADER_ROW_SCAN, range.e.r);

    for (let headerRow = range.s.r; headerRow <= lastRowToScan; headerRow++) {
      const header = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const v = getCellValue(ws, headerRow, c);
        header.push(v != null ? String(v).trim() : '');
      }
      // Kanonisasi dulu lewat alias (mis. "Ticket Number Inap" -> "Ticket ID") sebelum
      // dicek, supaya file dengan penamaan header berbeda tapi isinya sama tetap dikenali.
      const canonicalHeader = header.map((h) => CANONICAL_HEADER_MAP.get(normalizeHeaderText(h)) || h);
      const normalizedHeader = canonicalHeader.map(normalizeHeaderText);
      const hasAll = normalizedRequired.every((h) => normalizedHeader.includes(h));
      if (hasAll) return { ws, sheetName: name, headerRow };
    }
  }
  return null;
}

function isCsvFile(file) {
  const name = String(file?.name || '').toLowerCase();
  return name.endsWith('.csv') || file?.type === 'text/csv' || file?.type === 'application/csv';
}

/**
 * `dense: true` dipakai di semua jenis file — representasi array-of-array SheetJS ini
 * jauh lebih hemat memori & lebih cepat dibaca untuk sheet dengan puluhan-ratusan ribu
 * baris (mis. export SWFM Check yang bisa >100.000 baris x puluhan kolom).
 *
 * `wantDates`: true (default) untuk file yang memang butuh kolom tanggal asli (Merge,
 * Master Site). File SWFM Check TIDAK butuh tanggal sama sekali (cuma butuh Ticket ID +
 * Status + RC Category), jadi dipanggil dengan `wantDates: false` — mem-parsing tanggal
 * untuk >100rb baris itu mahal, jadi kalau tidak perlu, lebih baik dimatikan supaya
 * proses baca file besar jauh lebih cepat (teruji: dari sempat >3 menit/gagal jadi
 * hitungan puluhan detik).
 */
async function readWorkbook(file, { wantDates = true } = {}) {
  const buffer = await file.arrayBuffer();

  if (isCsvFile(file)) {
    const text = new TextDecoder('utf-8').decode(buffer);
    return XLSX.read(text, { type: 'string', raw: false, cellDates: wantDates, dense: true });
  }

  return XLSX.read(buffer, { type: 'array', cellDates: wantDates, dense: true });
}

function sheetToJsonFromHeaderRow(ws, headerRow) {
  return XLSX.utils.sheet_to_json(ws, { defval: '', range: headerRow }).map(canonicalizeRow);
}

/**
 * Baca file "Merge" (gabungan Cell Down + Site Down, satu file per regional).
 */
export async function readMergeFile(file) {
  const wb = await readWorkbook(file);
  const found = findDataSheet(wb, MERGE_REQUIRED_HEADERS);
  if (!found) {
    throw new Error(
      `Tidak menemukan sheet dengan kolom "${MERGE_REQUIRED_HEADERS.join('", "')}" di file "${file.name}". Pastikan ini file Merge CellDown+SiteDown yang benar dan memiliki minimal kolom Ticket ID serta Alarm Name.`
    );
  }
  return sheetToJsonFromHeaderRow(found.ws, found.headerRow);
}

/**
 * Baca file SWFM Check (file validasi versi ringan).
 */
export async function readSwfmCheckFile(file) {
  const wb = await readWorkbook(file, { wantDates: false });
  const found = findDataSheet(wb, SWFM_REQUIRED_HEADERS);
  if (!found) {
    throw new Error(
      `Tidak menemukan sheet dengan kolom "${SWFM_REQUIRED_HEADERS.join('", "')}" di file "${file.name}". Pastikan ini file SWFM Check yang benar.`
    );
  }
  return sheetToJsonFromHeaderRow(found.ws, found.headerRow);
}

/**
 * Baca file Master Site Detail (dipakai untuk lookup Cluster & Site Name via Site ID).
 * File ini besar (puluhan ribu baris) tapi kolomnya sedikit, jadi aman diparse penuh.
 */
export async function readMasterSiteFile(file) {
  const wb = await readWorkbook(file);
  const found = findDataSheet(wb, MASTER_REQUIRED_HEADERS);
  if (!found) {
    throw new Error(
      `Tidak menemukan sheet dengan kolom "${MASTER_REQUIRED_HEADERS.join('", "')}" di file "${file.name}". Pastikan ini file Master Site Detail yang benar.`
    );
  }
  return sheetToJsonFromHeaderRow(found.ws, found.headerRow);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Tanggal Excel -> 'YYYY-MM-DD HH:mm:ss' (waktu apa adanya seperti di sel, tanpa konversi
// timezone) supaya jam di database sama persis dengan yang tampil di file NOIM.
function toSqlDateTime(value) {
  if (value == null || value === '') return null;
  let d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // SheetJS kadang menghasilkan selisih sepersekian detik (mis. 07:09:59.999 untuk 07:10:00).
  d = new Date(Math.round(d.getTime() / 1000) * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function cellText(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * Baca file Data NOIM. Baris tanpa Site ID dilewati (di file asli ada baris kosong /
 * baris yang cuma berisi Remark). Kalau ada Site ID dobel, yang dipertahankan adalah
 * yang Start Time-nya paling lama (site itu sudah down paling lama).
 * Return: { rows, skippedNoSiteId, duplicates }
 */
export async function readNoimFile(file) {
  const wb = await readWorkbook(file);
  const found = findDataSheet(wb, NOIM_REQUIRED_HEADERS);
  if (!found) {
    throw new Error(
      `Tidak menemukan sheet dengan kolom "${NOIM_REQUIRED_HEADERS.join('", "')}" di file "${file.name}". Pastikan ini file Data NOIM yang benar.`
    );
  }
  const raw = sheetToJsonFromHeaderRow(found.ws, found.headerRow);

  const bySite = new Map();
  let skippedNoSiteId = 0;
  let duplicates = 0;
  for (const r of raw) {
    const siteId = cellText(r['Site ID']);
    if (!siteId) {
      skippedNoSiteId++;
      continue;
    }
    const row = {
      siteId,
      regional: cellText(r['Regional']),
      rcTier2: cellText(r['RC Tier 2']),
      rcCategory: cellText(r['RC Category']),
      startTime: toSqlDateTime(r['Start Time']),
      responsibleParty: cellText(r['Responsible Party']),
      nossa: cellText(r['NOSSA']),
      bcTime: toSqlDateTime(r['BC Time']),
      duration: cellText(r['Duration']),
      ticket: cellText(r['Ticket']),
      rcTier1: cellText(r['RC Tier 1']),
      nop: cellText(r['NOP']),
      rcCategoryValidasi: cellText(r['RC Category Validasi']),
      validasiRc: cellText(r['Validasi RC']),
      remark: cellText(r['Remark']),
      catTif: cellText(r['CAT TIF']),
    };
    const existing = bySite.get(siteId);
    if (!existing) {
      bySite.set(siteId, row);
    } else {
      duplicates++;
      if (row.startTime && (!existing.startTime || row.startTime < existing.startTime)) bySite.set(siteId, row);
    }
  }
  return { rows: Array.from(bySite.values()), skippedNoSiteId, duplicates };
}

export const RC_BULK_TEMPLATE_COLUMNS = [
  { key: 'ticketId', label: 'Ticket ID' },
  { key: 'regional', label: 'Regional' },
  { key: 'nop', label: 'NOP' },
  { key: 'cluster', label: 'Cluster' },
  { key: 'type', label: 'Tipe' },
  { key: 'siteId', label: 'Site ID' },
  { key: 'siteName', label: 'Site Name' },
  { key: 'duration', label: 'Duration' },
  { key: 'rc', label: 'RC Category' },
  { key: 'rcSub', label: 'RC Subcategory' },
  { key: 'pic', label: 'PIC' },
  { key: 'detail', label: 'Detail' },
  { key: 'actionPlan', label: 'Action Plan' },
];

const RC_BULK_ALLOWED_VALUES = {
  rc: RC_CATEGORIES,
  rcSub: Array.from(new Set(Object.values(RC_STRUCTURE).flat())),
  pic: PIC_OPTIONS,
};

export function buildBulkRcTemplateRows(rows = []) {
  return rows.map((row) => ({
    'Ticket ID': row?.ticketId ?? '',
    Regional: row?.regional ?? '',
    NOP: row?.nop ?? '',
    Cluster: row?.cluster ?? '',
    'Tipe': row?.catAlarm ?? row?.type ?? '',
    'Site ID': row?.siteId ?? '',
    'Site Name': row?.siteName ?? '',
    'Duration': row?.duration ?? '',
    'RC Category': row?.rc ?? '',
    'RC Subcategory': row?.rcSub ?? '',
    PIC: row?.pic ?? '',
    Detail: row?.detail ?? '',
    'Action Plan': row?.actionPlan ?? '',
  }));
}

function columnLetter(index) {
  let label = '';
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function slugifyName(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'LIST';
}

export async function exportBulkRcTemplate(rows = [], fileName = 'Bulk_RC_Template.xlsx') {
  const headers = RC_BULK_TEMPLATE_COLUMNS.map((col) => col.label);
  const data = buildBulkRcTemplateRows(rows);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CDS Monitoring';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Bulk RC', {
    properties: { tabColor: { argb: 'FF3B82F6' } },
  });

  worksheet.columns = [
  { header: headers[0], key: 'ticketId', width: 18 },
  { header: headers[1], key: 'regional', width: 18 },
  { header: headers[2], key: 'nop', width: 18 },
  { header: headers[3], key: 'cluster', width: 18 },
  { header: headers[4], key: 'type', width: 14 },
  { header: headers[5], key: 'siteId', width: 20 },
  { header: headers[6], key: 'siteName', width: 28 },
  { header: headers[7], key: 'duration', width: 18 },
  { header: headers[8], key: 'rc', width: 22 },
  { header: headers[9], key: 'rcSub', width: 26 },
  { header: headers[10], key: 'pic', width: 18 },
  { header: headers[11], key: 'detail', width: 46 },
  { header: headers[12], key: 'actionPlan', width: 46 },
];

  worksheet.addRows(data.map((row) => ({
    ticketId: row['Ticket ID'],
    regional: row.Regional,
    nop: row.NOP,
    cluster: row.Cluster,
    type: row['Tipe'],
    siteId: row['Site ID'],
    siteName: row['Site Name'],
    duration: row['Duration'],
    rc: row['RC Category'],
    rcSub: row['RC Subcategory'],
    pic: row.PIC,
    detail: row.Detail,
    actionPlan: row['Action Plan'],
  })));

  const listSheet = workbook.addWorksheet('Lists');
  listSheet.state = 'hidden';
  listSheet.columns = [{ width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];

  const categoryColumns = RC_CATEGORIES;
  categoryColumns.forEach((category, index) => {
    const colIndex = index + 1;
    const listValues = RC_STRUCTURE[category] || [];
    listSheet.getCell(1, colIndex).value = category;
    listValues.forEach((value, rowIndex) => {
      listSheet.getCell(rowIndex + 2, colIndex).value = value;
    });

    const startRow = 2;
    const endRow = startRow + Math.max(listValues.length, 1) - 1;
    const range = `Lists!$${columnLetter(colIndex)}$${startRow}:$${columnLetter(colIndex)}$${endRow}`;
    const name = `RC_${slugifyName(category)}`;
    workbook.definedNames.add(range, name);
  });

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3F4F6' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  const maxRow = Math.max(2, data.length + 1);
  const listValidation = (values) => ({
    type: 'list',
    allowBlank: true,
    formulae: [`"${values.join(',')}"`],
    showDropDown: true,
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Nilai tidak valid',
    error: 'Pilih salah satu nilai yang tersedia di dropdown.',
  });

  for (let rowNum = 2; rowNum <= maxRow; rowNum += 1) {
    worksheet.getCell(rowNum, 9).dataValidation = listValidation(RC_BULK_ALLOWED_VALUES.rc);
    worksheet.getCell(rowNum, 10).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`INDIRECT("RC_"&I${rowNum})`],
      showDropDown: true,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Nilai tidak valid',
      error: 'Pilih subcategory yang sesuai dengan RC Category yang dipilih.',
    };
    worksheet.getCell(rowNum, 11).dataValidation = listValidation(RC_BULK_ALLOWED_VALUES.pic);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function readBulkRcUpload(file) {
  const wb = await readWorkbook(file);
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) {
    throw new Error('File Excel kosong atau tidak valid.');
  }

  const ws = wb.Sheets[firstSheet];
  if (!ws || !ws['!ref']) {
    throw new Error('Sheet Excel tidak memiliki data.');
  }

  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  return rows
    .map((row) => {
      const obj = {};
      for (const [key, value] of Object.entries(row)) {
        const normalized = normalizeHeaderText(key).replace(/[^a-z0-9]/g, '');
        if (normalized === 'ticketid') obj.ticketId = String(value ?? '').trim();
        else if (normalized === 'regional') obj.regional = String(value ?? '').trim();
        else if (normalized === 'nop') obj.nop = String(value ?? '').trim();
        else if (normalized === 'cluster') obj.cluster = String(value ?? '').trim();
        else if (normalized === 'tipe' || normalized === 'type' || normalized === 'catalarm') obj.type = String(value ?? '').trim();
        else if (normalized === 'siteid') obj.siteId = String(value ?? '').trim();
        else if (normalized === 'sitename') obj.siteName = String(value ?? '').trim();
        else if (normalized === 'rccategory' || normalized === 'rc') obj.rc = String(value ?? '').trim();
        else if (normalized === 'rcsubcategory' || normalized === 'subcategory') obj.rcSub = String(value ?? '').trim();
        else if (normalized === 'pic') obj.pic = String(value ?? '').trim();
        else if (normalized === 'detail') obj.detail = String(value ?? '').trim();
        else if (normalized === 'actionplan' || normalized === 'action') obj.actionPlan = String(value ?? '').trim();
      }
      return obj;
    })
    .filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
}
