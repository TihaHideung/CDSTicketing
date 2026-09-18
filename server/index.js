import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { pool } from './db.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 4000;

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

}
ensureSchema();

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function toTicketKey(regional, ticketId) {
  return `${normalizeText(regional)}::${normalizeText(ticketId)}`;
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

function buildSnapshotSummary(rows) {
  const byRegional = {};
  const total = { cellDown: 0, siteDown: 0, total: 0 };

  for (const row of rows) {
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
  }

  return { byRegional, total };
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

  if (!merged.ticket_key) merged.ticket_key = toTicketKey(merged.regional, merged.ticket_id);
  return merged;
}

// ---------- Active Tickets ----------

app.get('/api/active-tickets', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM active_tickets');
  res.json(rows.map(rowToTicket));
});

app.post('/api/active-tickets/upsert', async (req, res) => {
  const { rows, uploadDate } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.json({ upserted: 0, trendDate: null });

  const snapshotDate = uploadDate || getJakartaDateKey();
  const deduped = new Map();
  for (const r of rows) {
    const ticketId = String(r.ticketId ?? '').trim();
    if (!ticketId) continue;
    const key = toTicketKey(r.regional, ticketId);
    const current = deduped.get(key);
    if (!current || (r.lastOccurredOn && (!current.lastOccurredOn || new Date(r.lastOccurredOn) > new Date(current.lastOccurredOn)))) {
      deduped.set(key, r);
    }
  }

  const cleanRows = Array.from(deduped.values());
  const incomingKeys = cleanRows.map((r) => toTicketKey(r.regional, r.ticketId));
  const [archiveRows] = await pool.query('SELECT * FROM ticket_archive WHERE ticket_key IN (?)', [incomingKeys.length ? incomingKeys : ['__NONE__']]);
  const archiveMap = new Map(archiveRows.map((r) => [r.ticket_key, r]));

  const finalMap = new Map();
  for (const r of cleanRows) {
    const key = toTicketKey(r.regional, r.ticketId);
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
      upload_date: r.uploadDate || snapshotDate,
    });
    finalMap.set(key, merged);
  }

  const [allArchiveRows] = await pool.query('SELECT ticket_key FROM ticket_archive');
  const archivedKeys = new Set(allArchiveRows.map((r) => r.ticket_key));
  const removedKeys = Array.from(archivedKeys).filter((key) => !finalMap.has(key));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

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

    const currentSnapshot = Array.from(finalMap.values());
    const snapshotSummary = buildSnapshotSummary(currentSnapshot);

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

    await conn.query(
      'INSERT INTO daily_trend (trend_date, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)',
      [snapshotDate, JSON.stringify(snapshotSummary)]
    );

    await conn.commit();
    res.json({ upserted: finalMap.size, trendDate: snapshotDate, archiveCount: finalMap.size });
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

app.get('/api/archive-history', async (req, res) => {
  const { date } = req.query;
  const params = [];
  let sql = 'SELECT * FROM ticket_archive_history';

  if (date) {
    sql += ' WHERE upload_date = ?';
    params.push(date);
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
  const { date, byRegional, total } = req.body;
  await pool.query(
    'INSERT INTO daily_trend (trend_date, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)',
    [date, JSON.stringify({ byRegional, total })]
  );
  const [rows] = await pool.query('SELECT trend_date, data FROM daily_trend ORDER BY trend_date ASC');
  res.json(
    rows.map((r) => {
      const payload = typeof r.data === 'string' ? JSON.parse(r.data) : r.data || {};
      return { date: r.trend_date, ...payload };
    })
  );
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

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`CDS Monitoring API jalan di http://localhost:${PORT}`);
});
