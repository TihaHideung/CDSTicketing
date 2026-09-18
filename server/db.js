import mysql from 'mysql2/promise';
import 'dotenv/config';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cds_monitoring',
  waitForConnections: true,
  connectionLimit: 10,
  // Kolom bertipe DATE (mis. trend_date) dikembalikan sebagai string 'YYYY-MM-DD' apa
  // adanya, BUKAN di-parse jadi objek Date. Ini penting supaya tidak ada pergeseran
  // tanggal akibat konversi timezone (mis. server jalan di WIB/UTC+7, lalu
  // `.toISOString()` pada objek Date mundur 1 hari). Kolom DATETIME (last_occurred_on,
  // dst) tetap dikembalikan sebagai objek Date seperti biasa.
  dateStrings: ['DATE'],
});
