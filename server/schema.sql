-- Ticket aktif kumulatif. Key utamanya `ticket_key` = `${regional}::${ticketId}` supaya
-- upload regional yang satu tidak pernah menimpa ticket regional lain.
CREATE TABLE IF NOT EXISTS active_tickets (
  ticket_key        VARCHAR(191) PRIMARY KEY,
  regional          VARCHAR(50)  NOT NULL,
  ticket_id         VARCHAR(100) NOT NULL,
  cat_alarm         VARCHAR(20)  NOT NULL, -- 'CellDown' | 'SiteDown'
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
  rc_category_auto  VARCHAR(150), -- referensi otomatis dari Excel/SWFM (bukan yang dipakai filter)
  rc                VARCHAR(50),   -- diisi manual petugas: Power/Radio/Transmisi/Others
  rc_sub            VARCHAR(100),  -- diisi manual petugas, tergantung `rc`
  pic               VARCHAR(50),   -- diisi manual petugas: Telkomsel/TP/Telkom/TI
  detail            TEXT,
  action_plan       TEXT,
  last_occurred_on  DATETIME,
  age_hours         DOUBLE,
  duration_bucket   VARCHAR(20),   -- <12H / 12H-24H / 1-3 Days / 3-7 Days / >7 Days
  swfm_match_status VARCHAR(20),
  merged_ticket_ids TEXT,          -- JSON array (hasil dedup Site Down by Site ID)
  upload_date       DATE,
  edited_at         DATETIME,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_regional (regional),
  INDEX idx_nop (nop),
  INDEX idx_cluster (cluster),
  INDEX idx_cat_alarm (cat_alarm),
  INDEX idx_rc (rc),
  INDEX idx_site_id (site_id)
) ENGINE=InnoDB;

-- Database kumulatif status SWFM yang sudah "ditangani" (Closed/Cancelled/Escalated/Resolved).
CREATE TABLE IF NOT EXISTS swfm_handled (
  ticket_id  VARCHAR(100) PRIMARY KEY,
  status     VARCHAR(150),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- RC Category dari SWFM (buat enrichment referensi, bukan dipakai filter utama).
CREATE TABLE IF NOT EXISTS swfm_info (
  ticket_id  VARCHAR(100) PRIMARY KEY,
  rc_category VARCHAR(150),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Snapshot terakhir tiket aktif yang berhasil diproses. Digunakan sebagai archive
-- untuk preserve data RC/PIC/Detail/Action Plan dari upload sebelumnya.
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
) ENGINE=InnoDB;

-- Snapshot archive per tanggal upload, supaya upload baru hari ini mengganti snapshot
-- tanggal itu tanpa menghapus riwayat archive dari hari lain.
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
) ENGINE=InnoDB;

-- Log trend harian: 1 baris per tanggal upload, isinya snapshot status terakhir sesuai
-- tanggal upload device user, bukan berdasarkan last_occurred.
CREATE TABLE IF NOT EXISTS daily_trend (
  trend_date DATE PRIMARY KEY,
  data       JSON NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Master data site (dari ExportMasterSiteDetail), dipakai untuk lookup Cluster & Site
-- Name yang lebih akurat berdasarkan Site ID. Diupload sesekali (tidak setiap hari).
CREATE TABLE IF NOT EXISTS site_master (
  site_id    VARCHAR(100) PRIMARY KEY,
  site_name  VARCHAR(255),
  nop        VARCHAR(150),
  regional   VARCHAR(150),
  cluster    VARCHAR(150),
  site_class VARCHAR(50),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
