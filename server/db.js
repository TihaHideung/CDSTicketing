import mysql from 'mysql2/promise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  // Kolom bertipe DATE (mis. trend_date) dikembalikan sebagai string 'YYYY-MM-DD' apa
  // adanya, BUKAN di-parse jadi objek Date. Ini penting supaya tidak ada pergeseran
  // tanggal akibat konversi timezone (mis. server jalan di WIB/UTC+7, lalu
  // `.toISOString()` pada objek Date mundur 1 hari). Kolom DATETIME (last_occurred_on,
  // dst) tetap dikembalikan sebagai objek Date seperti biasa.
  dateStrings: ['DATE'],
};

if (!dbConfig.host || !dbConfig.user || !dbConfig.database) {
  console.warn('[db] Variabel environment DB_HOST / DB_USER / DB_NAME belum diisi. Pastikan file server/.env ada dan benar.');
}

export const pool = mysql.createPool(dbConfig);
