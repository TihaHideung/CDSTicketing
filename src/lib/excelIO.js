import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {
  MERGE_COLUMNS,
  MERGE_REQUIRED_HEADERS,
  SWFM_COLUMNS,
  SWFM_REQUIRED_HEADERS,
  MASTER_COLUMNS,
  MASTER_REQUIRED_HEADERS,
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
    if (!ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const lastRowToScan = Math.min(range.s.r + MAX_HEADER_ROW_SCAN, range.e.r);

    for (let headerRow = range.s.r; headerRow <= lastRowToScan; headerRow++) {
      const header = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
        header.push(cell ? String(cell.v).trim() : '');
      }
      const normalizedHeader = header.map(normalizeHeaderText);
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

async function readWorkbook(file) {
  const buffer = await file.arrayBuffer();

  if (isCsvFile(file)) {
    const text = new TextDecoder('utf-8').decode(buffer);
    return XLSX.read(text, { type: 'string', raw: false, cellDates: true });
  }

  return XLSX.read(buffer, { type: 'array', cellDates: true });
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
  const wb = await readWorkbook(file);
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

export const RC_BULK_TEMPLATE_COLUMNS = [
  { key: 'ticketId', label: 'Ticket ID' },
  { key: 'regional', label: 'Regional' },
  { key: 'nop', label: 'NOP' },
  { key: 'cluster', label: 'Cluster' },
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
    { header: headers[4], key: 'rc', width: 22 },
    { header: headers[5], key: 'rcSub', width: 26 },
    { header: headers[6], key: 'pic', width: 18 },
    { header: headers[7], key: 'detail', width: 46 },
    { header: headers[8], key: 'actionPlan', width: 46 },
  ];

  worksheet.addRows(data.map((row) => ({
    ticketId: row['Ticket ID'],
    regional: row.Regional,
    nop: row.NOP,
    cluster: row.Cluster,
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
    worksheet.getCell(rowNum, 5).dataValidation = listValidation(RC_BULK_ALLOWED_VALUES.rc);
    worksheet.getCell(rowNum, 6).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`INDIRECT("RC_"&E${rowNum})`],
      showDropDown: true,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Nilai tidak valid',
      error: 'Pilih subcategory yang sesuai dengan RC Category yang dipilih.',
    };
    worksheet.getCell(rowNum, 7).dataValidation = listValidation(RC_BULK_ALLOWED_VALUES.pic);
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
