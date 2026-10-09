# Firebase Hosting + Google sign-in

Perubahan ini menyambungkan mode live ke token Firebase dan API Cloud Run.
Mode mock tetap tersedia; mode live tidak membaca login demo dari localStorage.
Belum ada deployment/tes login Google nyata sampai project disiapkan.

1. Ikuti setup backend di `ktp-asapify-be/docs/GCP.md`. Project ID Firebase harus sama dengan backend.
2. Buat Firebase Web App, aktifkan Google provider dan Authorized domains, lalu isi `.env.local`:

```dotenv
VITE_API_MODE=live
VITE_API_BASE=
VITE_FIREBASE_API_KEY=SALIN_DARI_FIREBASE_WEB_APP
VITE_FIREBASE_AUTH_DOMAIN=SALIN_DARI_FIREBASE_WEB_APP
VITE_FIREBASE_PROJECT_ID=PROJECT_ID_YANG_SAMA
VITE_FIREBASE_APP_ID=SALIN_DARI_FIREBASE_WEB_APP
VITE_PEAT_LAYER_URL=
VITE_PROVINCES_LAYER_URL=/mock/provinces.geojson
```

File batas provinsi yang sudah ada bersumber geoBoundaries; meskipun berada di folder `mock`, file ini
berisi geometri batas wilayah, bukan titik deteksi. Verifikasi atribusi sebelum publikasi.
Layer gambut kosong tidak berarti peta gambut telah tersedia. Pasang hasil build peat mask tim setelah siap.

3. Instal dependensi dari lockfile dan build:

```bash
npm ci
npm run build
```

4. Jalankan Firebase CLI resmi dengan akun berwenang, kemudian deploy ke project eksplisit:

```bash
npx firebase-tools login
npx firebase-tools deploy --only hosting --project "$ASAPIFY_PROJECT_ID"
```

`firebase.json` meneruskan `/api/**` ke `asapify-api` Jakarta sebelum fallback SPA.
Pastikan Cloud Run sudah menerima public invoker pada lapisan transport dan **API memverifikasi
Firebase ID token pada seluruh `/operator/**`**. Token Firebase tidak menggantikan IAM Cloud Run;
tanpa public transport, Hosting akan menerima 403 sebelum request mencapai aplikasi.

5. Login pertama membuat pengguna Firebase, tetapi akses aplikasi baru diberikan setelah admin
menambahkan custom claim `role=operator`. Admin memeriksa UID/email lalu memakai `tools/set_operator.py`
dari repo BE; pengguna keluar dan masuk lagi. Tidak ada email tim yang otomatis diizinkan.

## Pemeriksaan

- Login mock lama tidak membuka rute mode live.
- Selama sesi Firebase dipulihkan, halaman menunggu; tidak buru-buru mengarahkan ke login.
- Request operator mengirim `Authorization: Bearer <ID token>`; token diperbarui oleh Firebase SDK.
- Akun non-operator mendapat 403. Logout dan login ulang bekerja pada domain Hosting.
- Tanpa data pipeline, pesan data belum tersedia muncul; jangan menganggapnya data aman.
- Detail dan deep link `/kelompok/:id` berfungsi; worker MapLibre bertipe JavaScript.
- Keputusan dengan Telegram `pending`, `failed`, atau `unknown` ditandai belum terkonfirmasi.

Build mock dan live telah diperiksa secara lokal. Login Google nyata, Firebase rewrite, cloud persistence,
dan Telegram masih memerlukan uji integrasi pada project pengguna. Peringatan ukuran chunk MapLibre
sudah ada pada aplikasi dasar; perubahan ini mempertahankan pemuatan malasnya.

Referensi: https://firebase.google.com/docs/hosting/cloud-run dan
https://firebase.google.com/docs/auth/admin/custom-claims.

## Notification Engine v1

Halaman `/notifikasi` dapat dibuka semua akun Google terverifikasi. Peta dan keputusan tetap hanya operator.
Gunakan backend Notification Engine v1 dari repo BE; ikuti `docs/NOTIFICATIONS.md` untuk worker dan indeks.
Isi `VITE_FIREBASE_MESSAGING_SENDER_ID` dan `VITE_FIREBASE_VAPID_KEY` sebelum build.
FCM/Web Push hanya simulasi/non-darurat; WhatsApp/SMS/Gmail/LoRa/Bluetooth masih rencana, bukan pengirim aktif.

Tombol Telegram membuat deep link sekali pakai; tekan Start di bot lalu simpan preferensi. Push harus
didaftarkan dari browser yang mengizinkan. Offline diaktifkan lewat checkbox pengguna; hanya shell publik
dan inbox yang pernah dimuat tersimpan. Token dan respons API tidak masuk service-worker cache. Inbox lokal
dihapus ketika logout. Konfirmasi membutuhkan server; UI tidak membuat konfirmasi palsu saat offline.

`notification-sw.js` dibangun sebagai module service worker dan disajikan no-cache oleh Firebase Hosting.
Uji dari `npm run build && npm run preview`; Vite dev tidak menyajikan nama worker hasil build.

Target project dari screenshot pengguna: `hack2skill-510921` (nomor `950889990251`). Firebase Web App/config masih perlu diverifikasi di project itu.
