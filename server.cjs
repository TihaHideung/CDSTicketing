<<<<<<< HEAD
import('./server/index.js')
  .then(({ default: app }) => {
    const port = Number(process.env.PORT || 4000)
    const host = process.env.HOST || '0.0.0.0'
    app.listen(port, host, () => console.log(`CDS Monitoring: http://${host}:${port}`))
  })
  .catch((error) => {
    console.error('Application startup failed:', error)
    process.exitCode = 1
  })
=======
// server.cjs cuma jembatan supaya Hostinger (yang butuh entry file CommonJS) bisa
// menjalankan aplikasi ESM di server/index.js.
//
// PENTING: server/index.js SUDAH memanggil app.listen() sendiri di dalam dirinya
// (lewat fungsi startServer() yang otomatis jalan begitu file itu di-import). Jangan
// panggil app.listen() lagi di sini — kalau dipanggil dua kali pada app/port yang
// sama, Node akan langsung error "listen EADDRINUSE: address already in use" dan
// bikin proses crash begitu start, yang selama ini jadi penyebab deploy Hostinger
// selalu gagal walau kode & konfigurasi lain sudah benar.
import('./server/index.js').catch((error) => {
  console.error('Application startup failed:', error);
  process.exitCode = 1;
});

>>>>>>> ea24873 (Update Project)
