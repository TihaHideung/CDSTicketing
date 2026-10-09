import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { pool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_PATH = path.resolve(__dirname, '../dist');

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();

async function ensureFrontendBuild() {
  if (fs.existsSync(DIST_PATH)) return;

  const isProductionRuntime = process.env.NODE_ENV === 'production' || process.env.HOSTINGER === '1';

  if (isProductionRuntime) {
    throw new Error(
      'Frontend build not found. Build the frontend locally first and upload the generated dist/ folder before starting the production server on Hostinger.'
    );
  }

  const viteBin = path.join(PROJECT_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  console.log('Frontend build not found. Running local Vite build in project root...');

  await new Promise((resolve, reject) => {
    execFile(process.execPath, [viteBin, 'build'], {
      cwd: PROJECT_ROOT,
      env: process.env,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (stdout) console.log(stdout.trim());
      if (stderr) console.error(stderr.trim());
      if (error) {
        reject(new Error(`Frontend build failed: ${error.message}`));
        return;
      }
      resolve();
    });
  });

  if (!fs.existsSync(DIST_PATH)) {
    throw new Error(`Frontend build still not found at ${DIST_PATH}.`);
  }
}

const defaultAllowedOrigins = [
  'https://cdsticketing.3e-sumatera.com',
  'https://www.cdsticketing.3e-sumatera.com',
  'https://orangered-caribou-199611.hostingersite.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const envAllowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...envAllowedOrigins])];
const isHostingerOrigin = (origin) => typeof origin === 'string' && /(^|\.)hostingersite\.com$/i.test(origin);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || isHostingerOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} tidak diizinkan oleh CORS.`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));

const PORT = Number(process.env.PORT || 4000);

// Migrasi ringan: tambahkan kolom `pic` kalau belum ada (buat instalasi lama yang
// database-nya sudah dibuat sebelum kolom ini ditambahkan). Aman dijalankan berkali-kali.
async function ensureSchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_archive (
        ticket_key        VARCHAR(191) PRIMARY KEY,
        regional          VARCHAR(50)  NOT NULL,
        ticket_id         VARCHAR(100) NOT NULL,
        cat_alarm         VARCHAR(20)  NOT NULL,
        sub_type          VARCHAR(150),
        site_id           VARCHAR(100),
        site_name         VARCHAR(255),
        nop               VARCHAR(150),
        cluster           VARCHAR(150),
        regional_code     VARCHAR(50),
        site_class        VARCHAR(50),
        site_type         VARCHAR(50),
        alarm_name        VARCHAR(255),
        alarm_group       VARCHAR(255),
        ems_name          VARCHAR(255),
        clearance_status  VARCHAR(50),
        rc_category_auto  VARCHAR(150),
        rc                VARCHAR(50),
        rc_sub            VARCHAR(100),
        pic               VARCHAR(50),
        detail            TEXT,
        action_plan       TEXT,
        last_occurred_on  DATETIME,
        age_hours         DOUBLE,
        duration_bucket   VARCHAR(20),
        swfm_match_status VARCHAR(20),
        merged_ticket_ids TEXT,
        upload_date       DATE,
        uploaded_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
        edited_at         DATETIME,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_regional (regional),
        INDEX idx_nop (nop),
        INDEX idx_cluster (cluster),
        INDEX idx_ticket_id (ticket_id),
        INDEX idx_rc (rc),
        INDEX idx_site_id (site_id)
      ) ENGINE=InnoDB
    `);
    console.log('Migrasi: tabel `ticket_archive` siap dipakai.');
  } catch (err) {
    console.error('Gagal membuat ticket_archive:', err.message);
  }

  try {
    await pool.query('ALTER TABLE active_tickets DROP INDEX IF EXISTS ux_ticket_id');
    console.log('Migrasi: unique index lama pada ticket_id dihapus agar regional berbeda tidak overwrite.');
  } catch (err) {
    console.error('Gagal menghapus unique index lama:', err.message);
  }

  try {
    await pool.query('ALTER TABLE active_tickets ADD COLUMN pic VARCHAR(50) AFTER rc_sub');
    console.log('Migrasi: kolom `pic` ditambahkan ke active_tickets.');
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Gagal migrasi kolom pic:', err.message);
    }
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_archive_history (
        archive_id        BIGINT NOT NULL AUTO_INCREMENT,
        ticket_key        VARCHAR(191) NOT NULL,
        regional          VARCHAR(50)  NOT NULL,
        ticket_id         VARCHAR(100) NOT NULL,
        cat_alarm         VARCHAR(20)  NOT NULL,
        sub_type          VARCHAR(150),
        site_id           VARCHAR(100),
        site_name         VARCHAR(255),
        nop               VARCHAR(150),
        cluster           VARCHAR(150),
        regional_code     VARCHAR(50),
        site_class        VARCHAR(50),
        site_type         VARCHAR(50),
        alarm_name        VARCHAR(255),
        alarm_group       VARCHAR(255),
        ems_name          VARCHAR(255),
        clearance_status  VARCHAR(50),
        rc_category_auto  VARCHAR(150),
        rc                VARCHAR(50),
        rc_sub            VARCHAR(100),
        pic               VARCHAR(50),
        detail            TEXT,
        action_plan       TEXT,
        last_occurred_on  DATETIME,
        age_hours         DOUBLE,
        duration_bucket   VARCHAR(20),
        swfm_match_status VARCHAR(20),
        merged_ticket_ids TEXT,
        upload_date       DATE NOT NULL,
        uploaded_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
        edited_at         DATETIME,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (archive_id),
        UNIQUE KEY uq_archive_ticket_date (ticket_key, upload_date),
        INDEX idx_archive_upload_date (upload_date),
        INDEX idx_archive_ticket_key (ticket_key)
      ) ENGINE=InnoDB
    `);
    console.log('Migrasi: tabel `ticket_archive_history` siap dipakai untuk snapshot harian per upload.');
  } catch (err) {
    console.error('Gagal membuat ticket_archive_history:', err.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eas_vswr_history (
        date_iso   DATE PRIMARY KEY,
        data       JSON NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
    console.log('Migrasi: tabel `eas_vswr_history` siap dipakai untuk riwayat EAS & VSWR Tracking.');
  } catch (err) {
    console.error('Gagal membuat eas_vswr_history:', err.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pm_tracking_history (
        date_iso   DATE PRIMARY KEY,
        data       JSON NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
    console.log('Migrasi: tabel `pm_tracking_history` siap dipakai untuk riwayat PM Tracking (Site & Genset).');
  } catch (err) {
    console.error('Gagal membuat pm_tracking_history:', err.message);
  }

  try {
    // NOIM disimpan per tanggal (snapshot_date) supaya bisa dibuat trend irisan INAP & NOIM.
    // Primary key = (snapshot_date, site_id): upload ulang di tanggal yang sama hanya
    // menggantikan data tanggal itu, tanggal lain tidak tersentuh.
    await pool.query(`
CREATE TABLE IF NOT EXISTS noim_sites (
  snapshot_date        DATE NOT NULL,
  site_id              VARCHAR(100) NOT NULL,
  regional             VARCHAR(50),
  rc_tier2             VARCHAR(150),
  rc_category          VARCHAR(150),
  start_time           DATETIME,
  responsible_party    VARCHAR(150),
  nossa                VARCHAR(255),
  bc_time              DATETIME,
  duration             VARCHAR(50),
  ticket               VARCHAR(100),
  rc_tier1             VARCHAR(150),
  nop                  VARCHAR(150),
  rc_category_validasi VARCHAR(150),
  validasi_rc          TEXT,
  remark               TEXT,
  cat_tif              VARCHAR(100),
  uploaded_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (snapshot_date, site_id),
  INDEX idx_noim_site (site_id),
  INDEX idx_noim_regional (regional),
  INDEX idx_noim_nop (nop),
  INDEX idx_noim_ticket (ticket)
) ENGINE=InnoDB
    `);

    // Migrasi dari versi lama (tanpa snapshot_date, PK = site_id): data lama diberi
    // tanggal dari uploaded_at-nya, lalu PK diganti jadi (snapshot_date, site_id).
    const [cols] = await pool.query(
      "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'noim_sites' AND COLUMN_NAME = 'snapshot_date'"
    );
    if (!cols[0].c) {
      await pool.query('ALTER TABLE noim_sites ADD COLUMN snapshot_date DATE NULL FIRST');
      await pool.query('UPDATE noim_sites SET snapshot_date = DATE(COALESCE(uploaded_at, NOW())) WHERE snapshot_date IS NULL');
      await pool.query('ALTER TABLE noim_sites MODIFY snapshot_date DATE NOT NULL, DROP PRIMARY KEY, ADD PRIMARY KEY (snapshot_date, site_id), ADD INDEX idx_noim_site (site_id)');
      console.log('Migrasi: `noim_sites` diubah ke struktur per tanggal (snapshot_date).');
    }
    // Seragamkan regional data NOIM yang sudah tersimpan ("Regional 1" -> "Sumbagut", dst).
    const [mig] = await pool.query(
      `UPDATE noim_sites SET regional = CASE LOWER(REPLACE(TRIM(regional), ' ', ''))
         WHEN 'regional1' THEN 'Sumbagut' WHEN 'regional2' THEN 'Sumbagsel' WHEN 'regional10' THEN 'Sumbagteng' END
       WHERE LOWER(REPLACE(TRIM(regional), ' ', '')) IN ('regional1','regional2','regional10')`
    );
    if (mig.affectedRows) console.log(`Migrasi: ${mig.affectedRows} baris NOIM diseragamkan nama regionalnya.`);
    // Data NOIM hanya Regional 1/2/10 (Sumbagut/Sumbagsel/Sumbagteng); buang regional lain yang sudah tersimpan.
    const [purge] = await pool.query(
      "DELETE FROM noim_sites WHERE regional IS NULL OR regional NOT IN ('Sumbagut', 'Sumbagsel', 'Sumbagteng')"
    );
    if (purge.affectedRows) console.log(`Migrasi: ${purge.affectedRows} baris NOIM di luar Regional 1/2/10 dibuang.`);
    console.log('Migrasi: tabel `noim_sites` siap dipakai untuk data pembanding NOIM (per tanggal).');
  } catch (err) {
    console.error('Gagal membuat/migrasi noim_sites:', err.message);
  }

}
ensureSchema();

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function toTicketKey(regional, ticketId) {
  return `${normalizeText(regional)}::${normalizeText(ticketId)}`;
}

/**
 * Identitas ticket yang dipakai sebagai `ticket_key` (primary key penyimpanan).
 *
 * KHUSUS SiteDown: identitasnya per SITE ID, bukan per Ticket ID — jadi kalau Site X
 * sudah aktif SiteDown lalu muncul Ticket ID BARU untuk site yang sama (mis. ticket lama
 * ditutup sistem sumber lalu dibuka ulang dengan nomor baru, padahal site-nya masih
 * down), itu dianggap BARIS YANG SAMA (di-UPDATE), bukan baris baru — supaya data
 * manual yang sudah diisi (RC/RC Sub/PIC/Detail/Action Plan) tidak hilang/kereset, dan
 * juga tidak muncul sebagai 2 entry terpisah untuk site yang sama.
 *
 * CellDown TETAP per Ticket ID seperti biasa — 2 alarm CellDown di site yang sama pada
 * waktu berbeda memang 2 masalah yang berbeda, jadi harus tetap dianggap entry terpisah.
 */
function computeTicketKey(row) {
  const regional = normalizeText(row.regional);
  const catAlarm = row.catAlarm || row.cat_alarm || '';
  const siteId = normalizeText(row.siteId ?? row.site_id);
  if (catAlarm === 'SiteDown' && siteId) {
    return `${regional}::SITE::${siteId}`;
  }
  return toTicketKey(regional, row.ticketId ?? row.ticket_id);
}

function dateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rowToTicket(r) {
  return {
    _key: r.ticket_key,
    ticketId: r.ticket_id,
    catAlarm: r.cat_alarm,
    subType: r.sub_type,
    siteId: r.site_id,
    siteName: r.site_name,
    nop: r.nop,
    cluster: r.cluster,
    regional: r.regional,
    regionalCode: r.regional_code,
    siteClass: r.site_class,
    siteType: r.site_type,
    alarmName: r.alarm_name,
    alarmGroup: r.alarm_group,
    emsName: r.ems_name,
    clearanceStatus: r.clearance_status,
    rc: r.rc || '',
    rcSub: r.rc_sub || '',
    pic: r.pic || '',
    detail: r.detail || '',
    actionPlan: r.action_plan || '',
    lastOccurredOn: r.last_occurred_on,
    ageHours: r.age_hours,
    ageDays: r.age_hours != null ? r.age_hours / 24 : null,
    duration: r.duration_bucket,
    mergedTicketIds: r.merged_ticket_ids ? JSON.parse(r.merged_ticket_ids) : undefined,
    uploadDate: r.upload_date,
    editedAt: r.edited_at,
  };
}

function getJakartaDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Site Down TIDAK BOLEH punya Site ID duplikat (aturan yang sama seperti di frontend
 * `src/lib/cleaning.js` -> dedupeSiteDownBySiteId). Kalau 1 Site ID sama-sama down di
 * beberapa ticket sekaligus (mis. Heartbeat Failure + NE Is Disconnected barengan),
 * dihitung SATU KALI saja, ambil yang durasinya paling lama (age_hours terbesar).
 * Cell Down TIDAK di-dedup seperti ini karena beberapa sel bisa down bersamaan di
 * site yang sama secara sah (masing-masing ticket = trouble berbeda).
 *
 * Fungsi ini WAJIB dipakai sebelum menghitung ringkasan apapun (termasuk snapshot
 * trend harian) supaya angkanya selalu konsisten dengan yang ditampilkan di
 * Dashboard/KPI (yang sudah menerapkan dedup ini di sisi frontend).
 */
function dedupeSiteDownBySiteId(rows) {
  const cellDownRows = rows.filter((r) => r.cat_alarm === 'CellDown');
  const siteDownRows = rows.filter((r) => r.cat_alarm !== 'CellDown');

  const bySite = new Map();
  for (const r of siteDownRows) {
    const key = r.site_id || r.ticket_id;
    if (!bySite.has(key)) {
      bySite.set(key, r);
      continue;
    }
    const existing = bySite.get(key);
    if ((r.age_hours || 0) > (existing.age_hours || 0)) {
      bySite.set(key, r);
    }
  }

  return [...cellDownRows, ...bySite.values()];
}

function buildSnapshotSummary(rows) {
  const dedupedRows = dedupeSiteDownBySiteId(rows);
  const byRegional = {};
  const total = { cellDown: 0, siteDown: 0, total: 0 };
  // `breakdown`: rincian per kombinasi Regional/NOP/Cluster/Category/Duration/RC/RC Sub,
  // supaya Trend Harian di frontend bisa dihitung ulang mengikuti filter yang aktif
  // (bukan cuma filter Regional seperti sebelumnya), tanpa perlu query ulang ke DB.
  const breakdownMap = new Map();

  for (const row of dedupedRows) {
    const regional = normalizeText(row.regional) || 'UNKNOWN';
    const group = byRegional[regional] || { cellDown: 0, siteDown: 0, total: 0 };
    if (row.cat_alarm === 'CellDown') {
      group.cellDown += 1;
      total.cellDown += 1;
    } else {
      group.siteDown += 1;
      total.siteDown += 1;
    }
    group.total += 1;
    total.total += 1;
    byRegional[regional] = group;

    const nop = normalizeText(row.nop);
    const cluster = normalizeText(row.cluster);
    const catAlarm = normalizeText(row.cat_alarm) || 'CellDown';
    const duration = normalizeText(row.duration_bucket);
    const rc = normalizeText(row.rc);
    const rcSub = normalizeText(row.rc_sub);
    const bKey = [regional, nop, cluster, catAlarm, duration, rc, rcSub].join('|');
    const existingItem = breakdownMap.get(bKey);
    if (existingItem) {
      existingItem.count += 1;
    } else {
      breakdownMap.set(bKey, { regional, nop, cluster, catAlarm, duration, rc, rcSub, count: 1 });
    }
  }

  return { byRegional, total, breakdown: Array.from(breakdownMap.values()) };
}

function mergeArchiveValues(existingRow, incomingRow) {
  const merged = { ...incomingRow };
  const preserve = {
    rc: existingRow?.rc,
    rc_sub: existingRow?.rc_sub,
    pic: existingRow?.pic,
    detail: existingRow?.detail,
    action_plan: existingRow?.action_plan,
  };

  if (!normalizeText(merged.rc) && preserve.rc) merged.rc = preserve.rc;
  if (!normalizeText(merged.rc_sub) && preserve.rc_sub) merged.rc_sub = preserve.rc_sub;
  if (!normalizeText(merged.pic) && preserve.pic) merged.pic = preserve.pic;
  if (!normalizeText(merged.detail) && preserve.detail) merged.detail = preserve.detail;
  if (!normalizeText(merged.action_plan) && preserve.action_plan) merged.action_plan = preserve.action_plan;

  // Gabungkan histori Ticket ID (khusus SiteDown yang identitasnya per-Site): Ticket ID
  // lama yang sudah tercatat di baris ini sebelumnya TIDAK boleh hilang cuma karena
  // upload hari ini menyebut Ticket ID yang berbeda untuk site yang sama.
  try {
    const existingMerged = existingRow?.merged_ticket_ids ? JSON.parse(existingRow.merged_ticket_ids) : [];
    const incomingMerged = incomingRow.merged_ticket_ids ? JSON.parse(incomingRow.merged_ticket_ids) : [];
    const unioned = Array.from(
      new Set([...(Array.isArray(existingMerged) ? existingMerged : []), ...(Array.isArray(incomingMerged) ? incomingMerged : [])])
    );
    merged.merged_ticket_ids = unioned.length ? JSON.stringify(unioned) : null;
  } catch {
    // kalau JSON lama korup/format tak terduga, biarkan nilai incoming apa adanya
  }

  if (!merged.ticket_key) merged.ticket_key = computeTicketKey(merged);
  return merged;
}

// ---------- Active Tickets ----------

app.get('/api/active-tickets', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM active_tickets');
  res.json(rows.map(rowToTicket));
});

app.post('/api/active-tickets/upsert', async (req, res) => {
  const { rows, uploadDate, historicalOnly = false } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.json({ upserted: 0, trendDate: null });

  // `historicalOnly` = upload dengan TANGGAL PILIHAN (bukan waktu perangkat), untuk mengisi hari
  // yang terlewat. Hanya menulis ke riwayat (`ticket_archive_history`) + trend tanggal itu.
  // `active_tickets` & `ticket_archive` TIDAK disentuh, supaya data aktif & Dashboard tetap
  // mencerminkan kondisi terkini dan hanya berubah lewat upload waktu perangkat (alur biasa).
  if (historicalOnly) {
    const todayKey = getJakartaDateKey();
    if (!isValidIsoDate(uploadDate)) {
      return res.status(400).json({ error: 'Tanggal upload tidak valid (format YYYY-MM-DD).' });
    }
    if (uploadDate >= todayKey) {
      return res.status(400).json({
        error: `Tanggal pilihan harus sebelum hari ini (${todayKey}). Untuk hari ini gunakan "Waktu perangkat".`,
      });
    }
  }

  const snapshotDate = uploadDate || getJakartaDateKey();

  // Dedup dalam 1 batch upload pakai computeTicketKey() (per Site ID untuk SiteDown,
  // per Ticket ID untuk CellDown). Kalau ada >1 baris untuk identitas yang sama dalam 1
  // file (mis. Site X sempat punya 2 Ticket ID SiteDown sekaligus karena "di-replace"
  // sistem sumber), representative-nya dipilih yang PALING BARU terjadi
  // (`lastOccurredOn` paling akhir) — supaya Ticket ID, Severity, Duration, dst yang
  // tersimpan selalu mengikuti ticket yang AKTIF/BERLAKU sekarang, bukan yang lama.
  // Semua Ticket ID yang pernah ketemu tetap dicatat di `mergedTicketIds` untuk histori.
  //
  // RC/RC Sub/PIC/Detail/Action Plan TETAP aman biarpun representative-nya ganti-ganti —
  // itu diurus terpisah oleh `mergeArchiveValues` di bawah, yang selalu mempertahankan
  // isian manual dari baris lama kalau baris baru datang dengan field itu kosong.
  const dedupBuckets = new Map();
  for (const r of rows) {
    const ticketId = String(r.ticketId ?? '').trim();
    if (!ticketId) continue;
    const key = computeTicketKey(r);
    let bucket = dedupBuckets.get(key);
    if (!bucket) {
      bucket = { row: r, mergedTicketIds: new Set([ticketId]) };
      dedupBuckets.set(key, bucket);
      continue;
    }
    bucket.mergedTicketIds.add(ticketId);
    if (r.lastOccurredOn && (!bucket.row.lastOccurredOn || new Date(r.lastOccurredOn) > new Date(bucket.row.lastOccurredOn))) {
      bucket.row = r;
    }
  }

  const cleanRows = Array.from(dedupBuckets.values()).map(({ row, mergedTicketIds }) => ({
    ...row,
    mergedTicketIds: Array.from(mergedTicketIds),
  }));
  const incomingKeys = cleanRows.map((r) => computeTicketKey(r));
  const [archiveRows] = await pool.query('SELECT * FROM ticket_archive WHERE ticket_key IN (?)', [incomingKeys.length ? incomingKeys : ['__NONE__']]);
  const archiveMap = new Map(archiveRows.map((r) => [r.ticket_key, r]));

  const finalMap = new Map();
  for (const r of cleanRows) {
    const key = computeTicketKey(r);
    const merged = mergeArchiveValues(archiveMap.get(key), {
      ...r,
      ticket_key: key,
      ticket_id: String(r.ticketId ?? '').trim(),
      regional: normalizeText(r.regional),
      cat_alarm: r.catAlarm || r.cat_alarm || '',
      sub_type: r.subType || r.sub_type || '',
      site_id: r.siteId || r.site_id || '',
      site_name: r.siteName || r.site_name || '',
      nop: r.nop || '',
      cluster: r.cluster || '',
      regional_code: r.regionalCode || r.regional_code || '',
      site_class: r.siteClass || r.site_class || '',
      site_type: r.siteType || r.site_type || '',
      alarm_name: r.alarmName || r.alarm_name || '',
      alarm_group: r.alarmGroup || r.alarm_group || '',
      ems_name: r.emsName || r.ems_name || '',
      clearance_status: r.clearanceStatus || r.clearance_status || '',
      rc_category_auto: r.rcCategoryAuto || r.rc_category_auto || '',
      rc: r.rc || '',
      rc_sub: r.rcSub || r.rc_sub || '',
      pic: r.pic || '',
      detail: r.detail || '',
      action_plan: r.actionPlan || r.action_plan || '',
      last_occurred_on: r.lastOccurredOn || r.last_occurred_on || null,
      age_hours: r.ageHours ?? r.age_hours ?? null,
      duration_bucket: r.duration || r.duration_bucket || '',
      swfm_match_status: r.swfmMatchStatus || r.swfm_match_status || '',
      merged_ticket_ids: r.mergedTicketIds ? JSON.stringify(r.mergedTicketIds) : null,
      upload_date: historicalOnly ? snapshotDate : r.uploadDate || snapshotDate,
    });
    finalMap.set(key, merged);
  }

  // PENTING: "replace" HANYA boleh berlaku untuk regional yang benar-benar ada di
  // upload ini. Satu kali "Proses" cuma berisi 1 file/1 regional — kalau pembanding
  // "ticket lama yang harus dihapus" diambil dari SEMUA regional (bukan cuma regional
  // yang sedang diupload), maka upload regional B akan ikut menghapus ticket regional
  // A yang sebenarnya masih valid, hanya karena tidak ada di file regional B.
  const incomingRegionals = new Set(cleanRows.map((r) => normalizeText(r.regional)).filter(Boolean));
  const [allArchiveRows] = await pool.query('SELECT ticket_key, regional FROM ticket_archive');
  const archivedKeys = allArchiveRows
    .filter((r) => incomingRegionals.has(normalizeText(r.regional)))
    .map((r) => r.ticket_key);
  const removedKeys = archivedKeys.filter((key) => !finalMap.has(key));
  const writeActive = !historicalOnly;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Data aktif & archive hanya diubah oleh upload waktu perangkat (bukan historicalOnly).
    if (writeActive) {
      if (removedKeys.length) {
        await conn.query('DELETE FROM ticket_archive WHERE ticket_key IN (?)', [removedKeys]);
        await conn.query('DELETE FROM active_tickets WHERE ticket_key IN (?)', [removedKeys]);
      }

      for (const row of finalMap.values()) {
        const payload = {
          ticket_key: row.ticket_key,
          regional: row.regional || 'UNKNOWN',
          ticket_id: row.ticket_id,
          cat_alarm: row.cat_alarm || 'CellDown',
          sub_type: row.sub_type || '',
          site_id: row.site_id || '',
          site_name: row.site_name || '',
          nop: row.nop || '',
          cluster: row.cluster || '',
          regional_code: row.regional_code || '',
          site_class: row.site_class || '',
          site_type: row.site_type || '',
          alarm_name: row.alarm_name || '',
          alarm_group: row.alarm_group || '',
          ems_name: row.ems_name || '',
          clearance_status: row.clearance_status || '',
          rc_category_auto: row.rc_category_auto || '',
          rc: row.rc || '',
          rc_sub: row.rc_sub || '',
          pic: row.pic || '',
          detail: row.detail || '',
          action_plan: row.action_plan || '',
          last_occurred_on: row.last_occurred_on ? new Date(row.last_occurred_on) : null,
          age_hours: row.age_hours ?? null,
          duration_bucket: row.duration_bucket || '',
          swfm_match_status: row.swfm_match_status || '',
          merged_ticket_ids: row.merged_ticket_ids || null,
          upload_date: row.upload_date || snapshotDate,
          edited_at: null,
        };

        await conn.query(
          `INSERT INTO ticket_archive
            (ticket_key, regional, ticket_id, cat_alarm, sub_type, site_id, site_name, nop, cluster,
             regional_code, site_class, site_type, alarm_name, alarm_group, ems_name, clearance_status,
             rc_category_auto, rc, rc_sub, pic, detail, action_plan, last_occurred_on, age_hours,
             duration_bucket, swfm_match_status, merged_ticket_ids, upload_date, uploaded_at, edited_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
           ON DUPLICATE KEY UPDATE
             regional=VALUES(regional), ticket_id=VALUES(ticket_id), cat_alarm=VALUES(cat_alarm),
             sub_type=VALUES(sub_type), site_id=VALUES(site_id), site_name=VALUES(site_name), nop=VALUES(nop),
             cluster=VALUES(cluster), regional_code=VALUES(regional_code), site_class=VALUES(site_class),
             site_type=VALUES(site_type), alarm_name=VALUES(alarm_name), alarm_group=VALUES(alarm_group),
             ems_name=VALUES(ems_name), clearance_status=VALUES(clearance_status), rc_category_auto=VALUES(rc_category_auto),
             rc=VALUES(rc), rc_sub=VALUES(rc_sub), pic=VALUES(pic), detail=VALUES(detail), action_plan=VALUES(action_plan),
             last_occurred_on=VALUES(last_occurred_on), age_hours=VALUES(age_hours), duration_bucket=VALUES(duration_bucket),
             swfm_match_status=VALUES(swfm_match_status), merged_ticket_ids=VALUES(merged_ticket_ids), upload_date=VALUES(upload_date),
             edited_at=VALUES(edited_at)`,
          [
            payload.ticket_key, payload.regional, payload.ticket_id, payload.cat_alarm, payload.sub_type,
            payload.site_id, payload.site_name, payload.nop, payload.cluster, payload.regional_code,
            payload.site_class, payload.site_type, payload.alarm_name, payload.alarm_group, payload.ems_name,
            payload.clearance_status, payload.rc_category_auto, payload.rc, payload.rc_sub, payload.pic,
            payload.detail, payload.action_plan, payload.last_occurred_on, payload.age_hours,
            payload.duration_bucket, payload.swfm_match_status, payload.merged_ticket_ids, payload.upload_date,
            payload.edited_at,
          ]
        );

        await conn.query(
          `INSERT INTO active_tickets
            (ticket_key, regional, ticket_id, cat_alarm, sub_type, site_id, site_name, nop, cluster,
             regional_code, site_class, site_type, alarm_name, alarm_group, ems_name, clearance_status,
             rc_category_auto, rc, rc_sub, pic, detail, action_plan, last_occurred_on, age_hours,
             duration_bucket, swfm_match_status, merged_ticket_ids, upload_date, edited_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             cat_alarm=VALUES(cat_alarm), sub_type=VALUES(sub_type), site_id=VALUES(site_id),
             site_name=VALUES(site_name), nop=VALUES(nop), cluster=VALUES(cluster),
             regional_code=VALUES(regional_code), site_class=VALUES(site_class), site_type=VALUES(site_type),
             alarm_name=VALUES(alarm_name), alarm_group=VALUES(alarm_group), ems_name=VALUES(ems_name),
             clearance_status=VALUES(clearance_status), rc_category_auto=VALUES(rc_category_auto),
             rc=VALUES(rc), rc_sub=VALUES(rc_sub), pic=VALUES(pic), detail=VALUES(detail), action_plan=VALUES(action_plan),
             last_occurred_on=VALUES(last_occurred_on), age_hours=VALUES(age_hours),
             duration_bucket=VALUES(duration_bucket), swfm_match_status=VALUES(swfm_match_status),
             merged_ticket_ids=VALUES(merged_ticket_ids), upload_date=VALUES(upload_date), edited_at=VALUES(edited_at)`,
          [
            payload.ticket_key, payload.regional, payload.ticket_id, payload.cat_alarm, payload.sub_type,
            payload.site_id, payload.site_name, payload.nop, payload.cluster, payload.regional_code,
            payload.site_class, payload.site_type, payload.alarm_name, payload.alarm_group, payload.ems_name,
            payload.clearance_status, payload.rc_category_auto, payload.rc, payload.rc_sub, payload.pic,
            payload.detail, payload.action_plan, payload.last_occurred_on, payload.age_hours,
            payload.duration_bucket, payload.swfm_match_status, payload.merged_ticket_ids, payload.upload_date,
            payload.edited_at,
          ]
        );
      }
    }

    const currentSnapshot = Array.from(finalMap.values());

    // Upload ulang di tanggal pilihan = REPLACE riwayat regional di file ini pada tanggal itu
    // saja; regional lain di tanggal yang sama tidak terganggu.
    if (historicalOnly && incomingRegionals.size) {
      await conn.query('DELETE FROM ticket_archive_history WHERE upload_date = ? AND regional IN (?)', [
        snapshotDate,
        Array.from(incomingRegionals),
      ]);
    }

    for (const row of currentSnapshot) {
      await conn.query(
        `INSERT INTO ticket_archive_history
          (ticket_key, regional, ticket_id, cat_alarm, sub_type, site_id, site_name, nop, cluster,
           regional_code, site_class, site_type, alarm_name, alarm_group, ems_name, clearance_status,
           rc_category_auto, rc, rc_sub, pic, detail, action_plan, last_occurred_on, age_hours,
           duration_bucket, swfm_match_status, merged_ticket_ids, upload_date, uploaded_at, edited_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
         ON DUPLICATE KEY UPDATE
           regional=VALUES(regional), ticket_id=VALUES(ticket_id), cat_alarm=VALUES(cat_alarm),
           sub_type=VALUES(sub_type), site_id=VALUES(site_id), site_name=VALUES(site_name), nop=VALUES(nop),
           cluster=VALUES(cluster), regional_code=VALUES(regional_code), site_class=VALUES(site_class),
           site_type=VALUES(site_type), alarm_name=VALUES(alarm_name), alarm_group=VALUES(alarm_group),
           ems_name=VALUES(ems_name), clearance_status=VALUES(clearance_status), rc_category_auto=VALUES(rc_category_auto),
           rc=VALUES(rc), rc_sub=VALUES(rc_sub), pic=VALUES(pic), detail=VALUES(detail), action_plan=VALUES(action_plan),
           last_occurred_on=VALUES(last_occurred_on), age_hours=VALUES(age_hours), duration_bucket=VALUES(duration_bucket),
           swfm_match_status=VALUES(swfm_match_status), merged_ticket_ids=VALUES(merged_ticket_ids), upload_date=VALUES(upload_date),
           edited_at=VALUES(edited_at)`,
        [
          row.ticket_key, row.regional || 'UNKNOWN', row.ticket_id, row.cat_alarm || 'CellDown', row.sub_type || '',
          row.site_id || '', row.site_name || '', row.nop || '', row.cluster || '', row.regional_code || '',
          row.site_class || '', row.site_type || '', row.alarm_name || '', row.alarm_group || '', row.ems_name || '',
          row.clearance_status || '', row.rc_category_auto || '', row.rc || '', row.rc_sub || '', row.pic || '',
          row.detail || '', row.action_plan || '', row.last_occurred_on ? new Date(row.last_occurred_on) : null, row.age_hours ?? null,
          row.duration_bucket || '', row.swfm_match_status || '', row.merged_ticket_ids || null, row.upload_date || snapshotDate,
          row.edited_at || null,
        ]
      );
    }

    // Ringkasan trend harian (`daily_trend`):
    //  - Upload waktu perangkat: dihitung dari SELURUH ticket aktif di semua regional (bukan cuma
    //    baris upload ini). Satu kali "Proses" cuma berisi 1 file/1 regional, jadi kalau diambil
    //    dari `finalMap` saja, upload regional kedua di hari yang sama akan MENIMPA trend hari itu
    //    dengan angka regional kedua doang.
    //  - Tanggal pilihan (historicalOnly): dihitung dari riwayat tanggal itu (semua regional yang
    //    sudah diupload untuk tanggal itu), BUKAN dari ticket aktif yang isinya kondisi terkini.
    const [summaryRows] = historicalOnly
      ? await conn.query('SELECT * FROM ticket_archive_history WHERE upload_date = ?', [snapshotDate])
      : await conn.query('SELECT * FROM active_tickets');
    const snapshotSummary = buildSnapshotSummary(summaryRows);

    await conn.query(
      'INSERT INTO daily_trend (trend_date, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)',
      [snapshotDate, JSON.stringify(snapshotSummary)]
    );

    await conn.commit();
    res.json({
      upserted: finalMap.size,
      trendDate: snapshotDate,
      archiveCount: finalMap.size,
      mode: historicalOnly ? 'historical' : 'current',
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

app.patch('/api/active-tickets/:ticketKey', async (req, res) => {
  const { ticketKey } = req.params;
  const { rc, rcSub, pic, detail, actionPlan } = req.body;
  const payload = [rc ?? '', rcSub ?? '', pic ?? '', detail ?? '', actionPlan ?? '', ticketKey];

  await pool.query(
    `UPDATE active_tickets SET rc=?, rc_sub=?, pic=?, detail=?, action_plan=?, edited_at=NOW() WHERE ticket_key=?`,
    payload
  );
  await pool.query(
    `UPDATE ticket_archive SET rc=?, rc_sub=?, pic=?, detail=?, action_plan=?, edited_at=NOW() WHERE ticket_key=?`,
    payload
  );

  const [rows] = await pool.query('SELECT * FROM active_tickets WHERE ticket_key=?', [ticketKey]);
  res.json(rows[0] ? rowToTicket(rows[0]) : null);
});

// ---------- SWFM (handled-map & info kumulatif + auto-purge) ----------

app.get('/api/swfm/handled', async (_req, res) => {
  const [rows] = await pool.query('SELECT ticket_id, status FROM swfm_handled');
  const map = {};
  rows.forEach((r) => (map[r.ticket_id] = r.status));
  res.json(map);
});

app.get('/api/swfm/info', async (_req, res) => {
  const [rows] = await pool.query('SELECT ticket_id, rc_category FROM swfm_info');
  const map = {};
  rows.forEach((r) => (map[r.ticket_id] = { rcCategory: r.rc_category }));
  res.json(map);
});

app.post('/api/swfm/merge', async (req, res) => {
  const { handledMap = {}, infoMap = {} } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [ticketId, status] of Object.entries(handledMap)) {
      await conn.query(
        'INSERT INTO swfm_handled (ticket_id, status) VALUES (?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)',
        [ticketId, status]
      );
    }
    for (const [ticketId, info] of Object.entries(infoMap)) {
      await conn.query(
        'INSERT INTO swfm_info (ticket_id, rc_category) VALUES (?,?) ON DUPLICATE KEY UPDATE rc_category=VALUES(rc_category)',
        [ticketId, info.rcCategory || null]
      );
    }
    // Purge otomatis: buang ticket aktif manapun (regional apapun) yang ticket_id-nya
    // sekarang ada di swfm_handled, walau ticket itu tidak diupload ulang hari ini.
    // PENTING: hapus dari `ticket_archive` JUGA (bukan cuma `active_tickets`) — kalau
    // tidak, baris "hantu" tertinggal di ticket_archive dan bisa salah ke-preserve
    // (rc/rc_sub/pic/detail/action_plan dari ticket yang sudah closed) saat nanti ada
    // ticket baru datang dengan ticket_key yang sama (mis. SiteDown di site yang sama).
    await conn.query('DELETE FROM ticket_archive WHERE ticket_id IN (SELECT ticket_id FROM swfm_handled)');
    const [purgeResult] = await conn.query(
      'DELETE FROM active_tickets WHERE ticket_id IN (SELECT ticket_id FROM swfm_handled)'
    );
    await conn.commit();
    res.json({ handledMerged: Object.keys(handledMap).length, infoMerged: Object.keys(infoMap).length, purged: purgeResult.affectedRows });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ---------- Daily Trend ----------

app.get('/api/archive-history/latest-upload', async (_req, res) => {
  const [[row]] = await pool.query(
    // Hanya upload dengan tanggal terbaru: mengisi tanggal lampau (upload tanggal pilihan) tidak
    // boleh mengubah "Last data uploaded at", karena data aktif di Dashboard tidak berubah olehnya.
    "SELECT DATE_FORMAT(MAX(uploaded_at), '%Y-%m-%d %H:%i:%s') AS lastUploadedAt FROM ticket_archive_history WHERE upload_date = (SELECT MAX(upload_date) FROM ticket_archive_history)"
  );
  res.json({ lastUploadedAt: row?.lastUploadedAt || null });
});

app.get('/api/archive-history', async (req, res) => {
  const { date, from, to } = req.query;
  const params = [];
  let sql = 'SELECT * FROM ticket_archive_history';

  if (date) {
    sql += ' WHERE upload_date = ?';
    params.push(date);
  } else if (from && to) {
    sql += ' WHERE upload_date BETWEEN ? AND ?';
    params.push(from, to);
  } else if (from || to) {
    return res.status(400).json({ error: 'Tanggal awal dan akhir harus diisi bersama.' });
  }

  sql += ' ORDER BY upload_date ASC, ticket_key ASC';

  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

app.get('/api/daily-trend', async (_req, res) => {
  const [rows] = await pool.query('SELECT trend_date, data FROM daily_trend ORDER BY trend_date ASC');
  res.json(
    rows.map((r) => {
      const payload = typeof r.data === 'string' ? JSON.parse(r.data) : r.data || {};
      return { date: r.trend_date, ...payload };
    })
  );
});

app.post('/api/daily-trend', async (req, res) => {
  const { date, byRegional, total, breakdown } = req.body;
  await pool.query(
    'INSERT INTO daily_trend (trend_date, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)',
    [date, JSON.stringify({ byRegional, total, breakdown: breakdown || [] })]
  );
  const [rows] = await pool.query('SELECT trend_date, data FROM daily_trend ORDER BY trend_date ASC');
  res.json(
    rows.map((r) => {
      const payload = typeof r.data === 'string' ? JSON.parse(r.data) : r.data || {};
      return { date: r.trend_date, ...payload };
    })
  );
});

// ---------- EAS & VSWR Tracking (riwayat summary per tanggal) ----------
// 1 baris per tanggal update. Kolom `data` menyimpan satu record lengkap hasil generate
// (metrics, summaryText, raw EAS/VSWR, generatedAt), persis yang dipakai frontend untuk
// menampilkan summary, tabel progress, analytics perbandingan antar tanggal, dan export.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseEasVswrRow(r) {
  const payload = typeof r.data === 'string' ? JSON.parse(r.data) : r.data || {};
  return { ...payload, dateISO: r.date_iso };
}

app.get('/api/eas-vswr/history', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT date_iso, data FROM eas_vswr_history ORDER BY date_iso ASC');
    res.json(rows.map(parseEasVswrRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/eas-vswr/history/:dateISO', async (req, res) => {
  const { dateISO } = req.params;
  if (!ISO_DATE_RE.test(dateISO)) {
    return res.status(400).json({ error: 'Format tanggal harus YYYY-MM-DD.' });
  }
  const record = req.body;
  if (!record || typeof record !== 'object' || !record.metrics || !record.summaryText) {
    return res.status(400).json({ error: 'Data summary EAS & VSWR tidak valid.' });
  }
  try {
    const toSave = { ...record, dateISO };
    await pool.query(
      'INSERT INTO eas_vswr_history (date_iso, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)',
      [dateISO, JSON.stringify(toSave)]
    );
    res.json(toSave);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- PM Tracking (riwayat summary PM Site & Genset per tanggal) ----------
// 1 baris per tanggal update. Kolom `data` menyimpan satu record lengkap hasil generate
// (metrics Site & Genset, summaryText, data mentah file PM Site/Genset, generatedAt).

function parsePmTrackingRow(r) {
  const payload = typeof r.data === 'string' ? JSON.parse(r.data) : r.data || {};
  return { ...payload, dateISO: r.date_iso };
}

app.get('/api/pm-tracking/history', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT date_iso, data FROM pm_tracking_history ORDER BY date_iso ASC');
    res.json(rows.map(parsePmTrackingRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pm-tracking/history/:dateISO', async (req, res) => {
  const { dateISO } = req.params;
  if (!ISO_DATE_RE.test(dateISO)) {
    return res.status(400).json({ error: 'Format tanggal harus YYYY-MM-DD.' });
  }
  const record = req.body;
  if (!record || typeof record !== 'object' || !record.metrics?.site || !record.metrics?.genset || !record.summaryText) {
    return res.status(400).json({ error: 'Data summary PM Tracking tidak valid.' });
  }
  try {
    const toSave = { ...record, dateISO };
    await pool.query(
      'INSERT INTO pm_tracking_history (date_iso, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)',
      [dateISO, JSON.stringify(toSave)]
    );
    res.json({ dateISO, ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Site Master ----------

app.post('/api/site-master/import', async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.json({ imported: 0 });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const values = chunk.map((r) => [r.siteId, r.siteName, r.nop, r.regional, r.cluster, r.siteClass]);
      await conn.query(
        `INSERT INTO site_master (site_id, site_name, nop, regional, cluster, site_class) VALUES ?
         ON DUPLICATE KEY UPDATE site_name=VALUES(site_name), nop=VALUES(nop), regional=VALUES(regional),
           cluster=VALUES(cluster), site_class=VALUES(site_class)`,
        [values]
      );
    }
    await conn.commit();
    res.json({ imported: rows.length });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

app.post('/api/site-master/lookup', async (req, res) => {
  const { siteIds } = req.body;
  if (!Array.isArray(siteIds) || siteIds.length === 0) return res.json({});
  const [rows] = await pool.query('SELECT * FROM site_master WHERE site_id IN (?)', [siteIds]);
  const map = {};
  rows.forEach((r) => {
    map[r.site_id] = { siteName: r.site_name, nop: r.nop, regional: r.regional, cluster: r.cluster, siteClass: r.site_class };
  });
  res.json(map);
});

app.get('/api/site-master/count', async (_req, res) => {
  const [rows] = await pool.query('SELECT COUNT(*) as c FROM site_master');
  res.json({ count: rows[0].c });
});

// ---------- NOIM (pembanding data Site Down INAP) ----------
// Data NOIM disimpan per tanggal (snapshot_date). Upload di tanggal yang sama MENGGANTI
// data tanggal itu saja; tanggal lain tetap tersimpan, jadi bisa dibuat trend per tanggal.

function cleanText(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

// Regional di file NOIM ditulis "Regional 1/2/10"; disimpan sebagai nama regional
// (Sumbagut/Sumbagsel/Sumbagteng) supaya seragam dengan data INAP dan filter regional.
// Nilai yang tidak dikenali disimpan apa adanya.
const NOIM_REGIONAL_LOOKUP = {
  regional1: 'Sumbagut', regional2: 'Sumbagsel', regional10: 'Sumbagteng',
  sumbagut: 'Sumbagut', sumbagsel: 'Sumbagsel', sumbagteng: 'Sumbagteng',
  1: 'Sumbagut', 2: 'Sumbagsel', 10: 'Sumbagteng',
};
function normalizeNoimRegional(value) {
  const raw = cleanText(value);
  if (!raw) return null;
  return NOIM_REGIONAL_LOOKUP[raw.toLowerCase().replace(/[^a-z0-9]/g, '')] || raw;
}

const NOIM_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(v) {
  if (typeof v !== 'string' || !NOIM_DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

app.post('/api/noim/replace', async (req, res) => {
  const { rows, snapshotDate } = req.body;
  if (!isValidIsoDate(snapshotDate)) {
    return res.status(400).json({ error: 'Tanggal data NOIM wajib diisi (format YYYY-MM-DD).' });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Tidak ada baris NOIM untuk disimpan.' });
  }
  // Pengaman di server: hanya Regional 1 / 2 / 10 yang disimpan.
  const NOIM_ALLOWED = new Set(['Sumbagut', 'Sumbagsel', 'Sumbagteng']);
  const keptRows = rows.filter((r) => NOIM_ALLOWED.has(normalizeNoimRegional(r.regional)));
  if (keptRows.length === 0) {
    return res.status(400).json({ error: 'Tidak ada baris Regional 1 / 2 / 10 untuk disimpan.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query('SELECT COUNT(*) AS c FROM noim_sites WHERE snapshot_date = ?', [snapshotDate]);
    const replaced = existing[0].c;
    await conn.query('DELETE FROM noim_sites WHERE snapshot_date = ?', [snapshotDate]);
    const chunkSize = 300;
    for (let i = 0; i < keptRows.length; i += chunkSize) {
      const chunk = keptRows.slice(i, i + chunkSize);
      const values = chunk.map((r) => [
        snapshotDate,
        cleanText(r.siteId),
        normalizeNoimRegional(r.regional),
        cleanText(r.rcTier2),
        cleanText(r.rcCategory),
        r.startTime || null,
        cleanText(r.responsibleParty),
        cleanText(r.nossa),
        r.bcTime || null,
        cleanText(r.duration),
        cleanText(r.ticket),
        cleanText(r.rcTier1),
        cleanText(r.nop),
        cleanText(r.rcCategoryValidasi),
        cleanText(r.validasiRc),
        cleanText(r.remark),
        cleanText(r.catTif),
      ]);
      await conn.query(
        `INSERT INTO noim_sites
          (snapshot_date, site_id, regional, rc_tier2, rc_category, start_time, responsible_party, nossa, bc_time,
           duration, ticket, rc_tier1, nop, rc_category_validasi, validasi_rc, remark, cat_tif)
         VALUES ?
         ON DUPLICATE KEY UPDATE regional=VALUES(regional), rc_tier2=VALUES(rc_tier2),
           rc_category=VALUES(rc_category), start_time=VALUES(start_time),
           responsible_party=VALUES(responsible_party), nossa=VALUES(nossa), bc_time=VALUES(bc_time),
           duration=VALUES(duration), ticket=VALUES(ticket), rc_tier1=VALUES(rc_tier1), nop=VALUES(nop),
           rc_category_validasi=VALUES(rc_category_validasi), validasi_rc=VALUES(validasi_rc),
           remark=VALUES(remark), cat_tif=VALUES(cat_tif)`,
        [values]
      );
    }
    await conn.commit();
    const [cnt] = await pool.query('SELECT COUNT(*) AS c FROM noim_sites WHERE snapshot_date = ?', [snapshotDate]);
    res.json({ imported: cnt[0].c, snapshotDate, replaced });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// Daftar tanggal NOIM yang tersimpan (terbaru dulu) + jumlah site per tanggal.
app.get('/api/noim/dates', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT snapshot_date, COUNT(*) AS c, MAX(uploaded_at) AS uploaded_at
         FROM noim_sites GROUP BY snapshot_date ORDER BY snapshot_date DESC`
    );
    res.json(rows.map((r) => ({ date: r.snapshot_date, count: r.c, uploadedAt: r.uploaded_at })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bahan trend Site Down per tanggal untuk Sumber Data NOIM / IRISAN / TIDAK IRISAN.
// Hanya tanggal yang punya data NOIM yang dikembalikan. Per tanggal: baris NOIM (+ nop/cluster
// dari site_master) dan baris Site Down INAP dari archive upload di tanggal yang sama.
// Penyusunan breakdown & filter dilakukan di frontend (src/lib/siteDownTrend.js) supaya
// aturan mapping RC/Duration NOIM sama persis dengan yang dipakai dashboard.
app.get('/api/site-down/daily-sets', async (_req, res) => {
  try {
    const [noimRows] = await pool.query(
      `SELECT n.snapshot_date, n.site_id, n.regional, n.duration, n.rc_category_validasi,
              n.start_time, n.bc_time, COALESCE(NULLIF(n.nop, ''), m.nop) AS nop, m.cluster AS cluster
         FROM noim_sites n
         LEFT JOIN site_master m ON m.site_id = n.site_id`
    );
    const [inapRows] = await pool.query(
      `SELECT upload_date, site_id, regional, nop, cluster, duration_bucket, rc, rc_sub
         FROM ticket_archive_history
        WHERE cat_alarm = 'SiteDown' AND site_id <> ''
          AND upload_date IN (SELECT DISTINCT snapshot_date FROM noim_sites)`
    );
    const key = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
    const byDate = new Map();
    const bucket = (d) => {
      const k = key(d);
      if (!byDate.has(k)) byDate.set(k, { date: k, noim: [], inap: [] });
      return byDate.get(k);
    };
    for (const r of noimRows) {
      bucket(r.snapshot_date).noim.push({
        siteId: r.site_id,
        regional: r.regional,
        nop: r.nop || '',
        cluster: r.cluster || '',
        duration: r.duration,
        rcCategoryValidasi: r.rc_category_validasi,
        startTime: r.start_time,
        bcTime: r.bc_time,
      });
    }
    for (const r of inapRows) {
      bucket(r.upload_date).inap.push({
        siteId: r.site_id,
        regional: r.regional,
        nop: r.nop || '',
        cluster: r.cluster || '',
        duration: r.duration_bucket || '',
        rc: r.rc || '',
        rcSub: r.rc_sub || '',
      });
    }
    res.json(Array.from(byDate.values()).sort((a, b) => (a.date > b.date ? 1 : -1)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Data NOIM untuk satu tanggal (?date=YYYY-MM-DD; default = tanggal terbaru yang tersimpan)
// + info Cluster/Site Name/Site Class dari site_master (kalau site-nya ada di master),
// supaya filter Cluster & chart Site Class di dashboard ikut jalan untuk NOIM.
app.get('/api/noim', async (req, res) => {
  try {
    let date = req.query.date;
    if (date && !isValidIsoDate(date)) {
      return res.status(400).json({ error: 'Format tanggal harus YYYY-MM-DD.' });
    }
    if (!date) {
      const [[latest]] = await pool.query('SELECT MAX(snapshot_date) AS d FROM noim_sites');
      date = latest?.d || null;
    }
    if (!date) return res.json([]);
    const [rows] = await pool.query(
      `SELECT n.*, m.site_name AS m_site_name, m.cluster AS m_cluster, m.site_class AS m_site_class,
              m.nop AS m_nop
         FROM noim_sites n
         LEFT JOIN site_master m ON m.site_id = n.site_id
        WHERE n.snapshot_date = ?`,
      [date]
    );
    res.json(
      rows.map((r) => ({
        snapshotDate: r.snapshot_date,
        siteId: r.site_id,
        regional: r.regional,
        rcTier2: r.rc_tier2,
        rcCategory: r.rc_category,
        startTime: r.start_time,
        responsibleParty: r.responsible_party,
        nossa: r.nossa,
        bcTime: r.bc_time,
        duration: r.duration,
        ticket: r.ticket,
        rcTier1: r.rc_tier1,
        nop: r.nop || r.m_nop,
        rcCategoryValidasi: r.rc_category_validasi,
        validasiRc: r.validasi_rc,
        remark: r.remark,
        catTif: r.cat_tif,
        siteName: r.m_site_name,
        cluster: r.m_cluster,
        siteClass: r.m_site_class,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

async function startServer() {
  try {
    await ensureFrontendBuild();
  } catch (error) {
    console.error('Gagal menyiapkan frontend build:', error.message);
    process.exit(1);
  }

  if (fs.existsSync(DIST_PATH)) {
    app.use(express.static(DIST_PATH, { index: false }));

    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(DIST_PATH, 'index.html'));
    });
  } else {
    app.get('*', (_req, res) => {
      res.status(404).json({
        error: 'Frontend build not found. Run `npm run build` in the project root before starting the server in production.',
      });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server CDS Monitoring berjalan di http://0.0.0.0:${PORT}`);
    console.log(`Frontend build served from: ${DIST_PATH}`);
  });
}

startServer();
export default app;
