# CDS Monitoring — Cell Down & Site Down

Aplikasi React + backend Express/MySQL untuk membersihkan, mencocokkan (matching ala
VLOOKUP), memvisualisasikan (chart), meng-edit (RC/Detail/Action Plan), dan meng-export
hasil analisa data **Cell Down** & **Site Down**, per Regional, terakumulasi harian.

## 1. Cara Menjalankan (2 proses terpisah)

**Backend (wajib jalan duluan):**
```bash
cd server
cp .env.example .env   # lalu sesuaikan kredensial MySQL-nya
mysql -u root -p < schema.sql
npm install
npm start               # jalan di http://localhost:4000
```
Detail lengkap ada di `server/README.md`.

**Frontend:**
```bash
npm install
npm run dev              # jalan di http://localhost:5173 (biasanya)
```

Kebutuhan: Node.js 18+, MySQL/MariaDB (lokal, "localhost").

> **Catatan Windows:** taruh folder project di path yang **tidak mengandung karakter `&`**.

## 2. Alur Kerja Aplikasi

**Sekali saja (atau tiap ada perubahan data site):** upload **Master Site Detail.xlsx**
di halaman Upload Data → tombol "Import ke Database". Dipakai untuk lookup **Cluster**
& **Site Name** yang akurat berdasarkan Site ID (bukan tebakan lagi).

**Setiap hari**, upload **2 file**:
1. **File Merge** (`Cell Down + Site Down` sudah digabung, 1 file per Regional — pilih
   Regional-nya: Sumbagut / Sumbagteng / Sumbagsel).
2. **File SWFM Check** (file validasi, dipakai untuk semua Regional).

Setelah diproses, data tersimpan **kumulatif di MySQL** (bukan cuma di browser) dan bisa
dilihat lewat:
- **Dashboard**: KPI, chart, trend harian, dan preview ticket (10 baris teratas, bisa
  diklik untuk lihat/edit detail).
- **Detail Ticket Active**: tabel lengkap semua ticket aktif (bisa dicari & difilter),
  klik baris untuk buka popup detail.
- **Export**: download Excel sesuai filter yang aktif.

Semua 3 halaman itu punya filter: **Regional, NOP, Cluster, Kategori (Cell Down/Site
Down), RC Category, RC Subcategory**.

## 3. RC Category & Subcategory (bertingkat, diisi manual)

Setiap ticket baru **sengaja dikosongkan** RC-nya — tidak diisi otomatis dari Excel/SWFM,
murni menunggu diisi petugas lewat popup (klik baris ticket manapun).

Struktur RC bertingkat (`src/lib/constants.js` → `RC_STRUCTURE`):
```
Power      → Pemadaman PLN, Hardware, Vandalism, Anomaly Data
Radio      → Hardware, Vandalism, Support Event, Anomaly Data
Transmisi  → FO Cut, VLAN Issue, Hardware, Anomaly Data
Others     → ComCase, Access, Reloc, NewSite, Dismantle, Anomaly Data
```
Pilih RC Category dulu di popup, baru RC Subcategory yang sesuai kategori itu muncul.

Editan RC/RC Sub/Detail/Action Plan **tersimpan permanen di database** dan **tidak akan
tertimpa** kalau ticket yang sama diupload ulang di hari berikutnya — hanya field
otomatis (aging, status SWFM, dst) yang diperbarui. Logika ini sekarang berjalan di
**server** (`server/index.js` → endpoint upsert), bukan di frontend lagi.

## 4. Duration (pengganti "Aging Category" lama)

Duration = Time Now (device) − Last Occurred On, dikategorikan:
`<12H`, `12H-24H`, `1-3 Days`, `3-7 Days`, `>7 Days`.

**Perubahan penting:** aturan lama "buang ticket di bawah 24 jam" sudah **dihapus** —
sekarang semua umur ticket (termasuk yang baru < 24 jam) tetap ditampilkan dan
dikategorikan lewat Duration ini. Kalau ternyata aturan buang <24 jam itu masih
diperlukan terpisah dari kategori Duration, tinggal beri tahu, gampang ditambahkan lagi
di `src/lib/cleaning.js`.

## 5. Cluster & Site Name dari Master Site Detail

Sebelumnya Cluster tidak punya sumber data sama sekali dan Site Name cuma tebakan dari
kolom Alarm Source. Sekarang keduanya diambil dari **lookup ke file Master Site Detail**
berdasarkan Site ID (`src/lib/dbApi.js` → `lookupSiteMaster`, dipanggil di
`App.jsx` → `handleProcess` sebelum cleaning). Sudah diuji dengan file master asli
(20.249 site) — 100% Site ID di file Merge contoh berhasil ketemu Cluster & Site
Name-nya.

## 6. Filter Regional / NOP / Cluster / Kategori / RC

- **Regional → NOP → Cluster**: NOP & Cluster otomatis menyesuaikan opsi berdasarkan
  Regional yang dipilih (reset ke "Semua" tiap ganti Regional).
- **Kategori**: Cell Down / Site Down / Semua.
- **RC Category → RC Subcategory**: bertingkat sama seperti di popup edit; ada opsi
  "(Under Review)" untuk mencari ticket yang RC-nya belum diisi sama sekali.

Filter ini dipakai konsisten di Dashboard, Detail Ticket Active, dan Export.

## 7. Chart & Trend — Perbaikan "Semua Regional Tergabung Jadi Satu"

Sebelumnya, saat filter "Semua Regional" dipilih, Trend Harian menjumlahkan semua
regional jadi satu batang/garis per hari — jadi tidak kelihatan perbandingan antar
regionalnya. Sekarang:
- **Filter = 1 Regional tertentu** → Trend tampil seperti biasa (CellDown/SiteDown
  stacked + garis Total).
- **Filter = Semua Regional** → Trend tampil sebagai **batang per Regional dijejerkan**
  per hari (Sumbagut/Sumbagteng/Sumbagsel side-by-side), bukan dijumlahkan.

Chart **Area Contributor** sudah otomatis per-Regional sejak awal (tidak berubah).
Chart lain (Cell vs Site Down, Site Class, RC Category, Duration) tetap ditampilkan
sebagai agregat gabungan saat "Semua Regional" dipilih — kalau ternyata kamu juga mau
chart-chart itu dipecah per Regional (mis. jadi grid kecil per regional), tinggal minta,
tapi berhubung itu perubahan struktur chart yang cukup besar sengaja belum saya sertakan
sekarang.

## 8. Perbaikan Bug: File Merge Gagal Terbaca ("Tidak menemukan sheet...")

**Penyebab:** file Excel yang lebih baru (`Merge_15_Sep_SBT.xlsx` dkk.) ternyata punya
baris ringkasan tambahan di baris pertama sheet data, jadi header sebenarnya ada di
baris ke-2, bukan baris pertama seperti file-file sebelumnya. Kode lama cuma mengecek
baris pertama saja.

**Perbaikan:** `src/lib/excelIO.js` sekarang memindai sampai 6 baris pertama tiap sheet
untuk mencari baris yang benar-benar berisi header yang dibutuhkan, bukan asumsi selalu
di baris pertama. Sudah diuji langsung dengan file yang tadinya error — sekarang
terbaca 442 baris dengan benar.

## 9. Struktur Project

```
src/
  lib/
    constants.js     # kolom, Regional, struktur RC bertingkat, Duration bucket
    excelIO.js        # baca file Merge/SWFM Check/Master Site (auto-deteksi sheet & baris header)
    cleaning.js        # cleaning + matching SWFM + dedup Site Down + enrichment master
    swfmCheck.js         # bangun handled-map & info-map dari file SWFM Check
    aggregate.js           # summary/pivot, group by Site ID, trend (single & per-region)
    exportExcel.js           # build & download file Excel hasil export
    dbApi.js                  # client HTTP ke backend (menggantikan IndexedDB)
  components/          # UI (Dashboard, FilterBar, TicketDetailModal, chart, dst.)
  App.jsx               # orkestrasi: upload, cleaning, matching, filter, popup edit
server/
  schema.sql            # skema MySQL
  index.js               # Express API
  db.js                    # koneksi mysql2
  README.md                 # panduan setup backend
```

## 10. Yang Bisa Dikembangkan Lagi

- Pecah chart-chart lain (bukan cuma Trend) jadi grouped-by-region saat filter "Semua
  Regional" dipilih, kalau memang dibutuhkan.
- Tambahkan riwayat perubahan (siapa mengedit apa, kapan) kalau dipakai banyak petugas.
- Tambahkan autentikasi supaya jelas siapa yang mengedit ticket mana.
