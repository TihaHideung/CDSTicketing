# CDS Monitoring — Backend (Express + MySQL)

Backend ringan untuk menyimpan data CDS Monitoring secara permanen & kumulatif di MySQL,
menggantikan penyimpanan browser (IndexedDB) versi sebelumnya. Dengan ini data tidak lagi
terkunci di satu browser saja.

## 1. Setup MySQL

Pastikan MySQL/MariaDB sudah terinstall & jalan di komputer kamu (localhost).

```bash
# masuk ke MySQL sebagai root (sesuaikan cara login ke MySQL kamu)
mysql -u root -p < schema.sql
```

Ini akan membuat database `cds_monitoring` beserta semua tabelnya.

**Rekomendasi:** buat user khusus untuk aplikasi (jangan pakai root langsung), karena
driver Node (`mysql2`) butuh autentikasi berbasis password, bukan `auth_socket` yang
biasanya dipakai user `root` secara default di banyak instalasi MySQL/MariaDB:

```sql
CREATE USER 'cds_app'@'localhost' IDENTIFIED BY 'cds123';
GRANT ALL PRIVILEGES ON cds_monitoring.* TO 'cds_app'@'localhost';
FLUSH PRIVILEGES;
```

## 2. Konfigurasi

```bash
cp .env.example .env
```

Edit `.env` sesuai kredensial MySQL kamu:

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=cds_app
DB_PASSWORD=password_kamu
DB_NAME=cds_monitoring
PORT=4000
```

> Kalau MySQL kamu jalan di `localhost` lewat unix socket dan user `root`-nya pakai
> `auth_socket` (tanpa password), koneksi dari Node biasanya GAGAL ("Access denied ...
> using password: NO"). Solusinya ya buat user terpisah dengan password seperti di atas.

## 3. Jalankan

```bash
npm install
npm start
```

Server akan jalan di `http://localhost:4000`. Cek dengan:

```bash
curl http://localhost:4000/api/health
```

Frontend (folder utama project, bukan folder `server/` ini) perlu dijalankan terpisah
di terminal lain (`npm run dev`), dan secara default sudah mengarah ke
`http://localhost:4000`. Kalau backend kamu jalan di port/host lain, set
`VITE_API_URL` di file `.env` pada folder utama project (bukan folder `server/`).

## 4. Struktur Tabel (ringkas — detail lengkap di `schema.sql`)

- **active_tickets** — ticket aktif kumulatif. Key utama `ticket_key` =
  `Regional::TicketID`, supaya upload regional yang satu tidak pernah menimpa data
  regional lain.
- **swfm_handled** — status SWFM "sudah ditangani" kumulatif, dipakai untuk auto-purge
  ticket yang sudah selesai dari `active_tickets`.
- **swfm_info** — RC Category referensi dari SWFM (bukan yang dipakai filter utama).
- **daily_trend** — 1 baris per tanggal, isinya breakdown kumulatif per regional pada
  tanggal itu (kolom `data` bertipe JSON).
- **site_master** — hasil import file Master Site Detail, dipakai untuk lookup Cluster
  & Site Name berdasarkan Site ID.

## 5. Endpoint API

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/active-tickets` | Semua ticket aktif |
| POST | `/api/active-tickets/upsert` | Upsert banyak ticket sekaligus (mempertahankan RC/Detail/Action Plan yang sudah diisi petugas) |
| PATCH | `/api/active-tickets/:ticketKey` | Update RC/RC Sub/Detail/Action Plan satu ticket |
| GET / POST | `/api/swfm/handled`, `/api/swfm/info` | Baca / gabung data SWFM kumulatif |
| POST | `/api/swfm/merge` | Gabung hasil SWFM Check baru + auto-purge ticket yang sudah ditangani |
| GET / POST | `/api/daily-trend` | Baca / tambah entry trend harian |
| POST | `/api/site-master/import` | Import massal Master Site Detail |
| POST | `/api/site-master/lookup` | Cari Cluster/Site Name untuk daftar Site ID |
| GET | `/api/site-master/count` | Jumlah site tersimpan |

Semua endpoint ini sudah diuji langsung (bukan cuma ditulis) terhadap instance
MySQL/MariaDB nyata, termasuk skenario: import 20 ribuan baris master site, upload 3
regional berurutan (memastikan tidak saling menimpa), edit ticket lalu upload ulang
(memastikan editan tidak hilang), dan auto-purge saat SWFM match.
