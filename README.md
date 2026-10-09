# asapify-web

**Integrasi GCP:** lihat [docs/GCP.md](docs/GCP.md) untuk Firebase Hosting, login Google,
custom claim operator dan API Cloud Run. Mode live kini mengirim token Firebase; mode mock tetap tersedia.

Web operator ASAPify (Google Cloud AI Builder Cup 2026): peta status piksel gambut Sumatra dan Kalimantan (15 provinsi),
detail kelompok `AWAS` (atribut MAUT, tetangga, verifikasi agen), dan keputusan terbitkan/tolak.

- Spesifikasi UI: `../asapify/ui.html` · kontrak API: `../asapify/backend.html` bagian 03–05
- Konsep dan aturan sistem: `../ASAPify_Pitch_Google_AI_Builder_2026/WORKLOG.md` bagian 7–10
- Bahasa default Inggris; Indonesia lewat tombol ID/EN di bilah atas (pilihan disimpan per perangkat)

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit + vite build → dist/
```

Salin `.env.example` ke `.env` bila perlu mengganti mode:

| Variabel | Nilai | Arti |
|---|---|---|
| `VITE_API_MODE` | `mock` (default) / `live` | `mock` = data fiktif tanpa backend; `live` = `asapify-api` |
| `VITE_API_BASE` | URL | Basis API untuk mode live; kosong = same-origin (`/api` di-proxy ke `:8080` saat dev) |
| `VITE_PEAT_LAYER_URL` | URL GeoJSON | Layer `peat-boundary` di bucket publik (mode live) |
| `VITE_PROVINCES_LAYER_URL` | URL GeoJSON | Layer batas provinsi di bucket publik (mode live) |

## Deploy (GitHub → Vercel)

Vercel hanya untuk pratinjau mode mock. URL prototipe yang dinilai ada di Firebase Hosting dalam mode live
(`../asapify/cloud.html` bagian 11).

1. Buat repo kosong di GitHub, lalu dari folder ini:
   `git remote add origin <url-repo>` → `git push -u origin main`.
2. Di Vercel: **Add New → Project → Import** repo tersebut. Pengaturan dibaca dari `vercel.json`
   (Vite, `npm ci`, `npm run build`, output `dist/`), jadi tidak perlu diubah.
3. Tanpa environment variable apa pun, situs berjalan dalam **mode mock** (data fiktif + login demo).
   Setelah `asapify-api` siap, isi `VITE_API_MODE=live` dan `VITE_API_BASE=<url asapify-api>`
   di Project Settings → Environment Variables, lalu redeploy (variabel `VITE_*` dibaca saat build).

`vercel.json` juga mengarahkan semua rute ke `index.html` (deep link `/kelompok/C-0924-002` tidak 404)
dan menyajikan `/maplibre/*.mjs` sebagai JavaScript untuk worker peta. Butuh Node ≥ 22.12 (`engines`).

> Login demo tidak melindungi apa pun: siapa saja yang membuka URL bisa masuk. Aman selama datanya fiktif;
> ganti ke Firebase Auth sebelum memakai data asli.

## Mode mock

Replay fiktif 24 Sep 2023 22.10 WIB. Setiap provinsi (10 Sumatra + 5 Kalimantan) punya area gambut fiktif di kawasan
gambut nyatanya, jadi filter provinsi mana pun menampilkan piksel. Lima kelompok AWAS: Kalteng (backtest, bbox
`113.5,-2.6,114.3,-1.9`) `C-0924-002` bukti kuat, `C-0924-001` inkonklusif, `C-0923-001` sudah diterbitkan;
Sumsel (OKI) `C-0924-003` bukti kuat; Riau (Kampar) `C-0924-004` inkonklusif.
Arsip malam 16 Feb–24 Sep 2023 (awal arsip GK2A di NOAA) bisa dibuka lewat kalender di pemutar slot: tanggal pudar =
tanpa data, titik = ada kelompok AWAS. Malam 11 Apr, 2 Jul, dan 19 Agu 2023 sengaja dibuat tanpa data. Malam 15 Sep
memuat kelompok lama `C-0915-001` (Kalbar, Kubu Raya) yang sudah ditolak dan ditutup.
Citra VIIRS diambil langsung dari NASA GIBS (citra asli tanggal itu); crop Himawari berupa ilustrasi SVG.
Keputusan disimpan di memori dan hilang saat halaman dimuat ulang. Login hanya tiruan (tanpa Firebase).

Keadaan layar bisa didemokan dengan `?skenario=` (diingat selama tab terbuka):
`normal` · `kosong` · `awan` · `satu_satelit` · `siang`.

## Kontrak API untuk tim BE

Buka tab **Kontrak API** di aplikasi (`/kontrak-api`, publik, ID/EN). Isinya: konvensi (auth, waktu UTC,
`as_of`, koordinat, galat), tabel kode galat, semua endpoint `asapify-api` (parameter, body, respons,
galat, layar UI yang memakainya), skema, file statis di bucket, dan endpoint internal `asapify-agent`.
Contoh JSON diambil dari fixture mock yang sama dengan UI, jadi tidak bisa berbeda dari tampilan.

Peta memakai **format ringkas**: `GET /operator/pixels` sekali (geometri grid, di-cache),
lalu `GET /operator/grid?format=compact` dan `GET /operator/grid/night` (54 slot dalam satu permintaan
untuk pemutar). Diukur untuk 10 ribu piksel per slot: ringkas ≈ 23 KB mentah / 11 KB gzip, GeoJSON ≈ 1,9 MB
mentah / 83 KB gzip. GeoJSON tetap tersedia (`format=geojson`, default) untuk alat lain.

## Peta ringan

- MapLibre (±290 KB gzip) hanya dimuat di rute peta; halaman lain ±113 KB gzip (±17 KB di antaranya inti gerak, lihat *Gerak*). Halaman detail kelompok (±10 KB gzip) juga dimuat per rute.
- Geometri piksel dibangun sekali; status per slot, filter status, dan pemutar memakai `feature-state`
  (hanya sel yang berubah yang ditulis ulang, tanpa re-tiling).
- Mode ringan otomatis bila penghemat data menyala, RAM ≤ 2 GB, ≤ 2 inti (atau ≤ 4 inti dengan RAM ≤ 4 GB),
  atau reduced-motion: basemap polos, tanpa pendar/garis grid/animasi kamera, pixel ratio 1, dan gerak
  transform antarmuka dimatikan (hanya memudar). Bisa diubah di kontrol Layer; pilihan disimpan per perangkat.
- Batas provinsi mock: geoBoundaries IDN ADM1 (ODbL, © OpenStreetMap contributors), 15 provinsi disederhanakan ±90 KB
  di `public/mock/`. Mode live memakai `VITE_PROVINCES_LAYER_URL`. Provinsi yang dipilih di filter digambar
  dengan garis batas tebal, labelnya, dan bayangan di luar provinsi.
- Label peta (nama provinsi, label peta dasar OpenFreeMap, tombol MapLibre) mengikuti bahasa UI.

Sumber datanya `src/contract/spec.ts` (tipe TypeScript tetap di `src/types.ts`). Semua endpoint
dan field di kontrak sudah tercantum di `backend.html` (disamakan 6 Okt 2026).

## Detail kelompok: suhu terukur

Halaman `/kelompok/:id` menampilkan angka, bukan hanya bobot:

- **Tooltip pada citra bukti.** Citra termal Himawari: arahkan kursor, ketuk, atau pakai tombol panah untuk melihat suhu
  kecerahan tiap piksel 0,02° (id piksel, koordinat, jarak dari penanda) untuk **Himawari-9 B07/B14** dan **GK2A
  SW038/IR105** dalam °C dan K, selisih kanal, anomali terhadap latar crop (median, simpangan MAD, z), dan apakah piksel
  itu anggota kelompok atau berawan. Citra VIIRS: koordinat + jarak di bawah kursor, dan titik deteksi FIRMS (satelit,
  waktu, jarak, keyakinan, FRP) yang bisa difokuskan dengan Tab. Tooltip dirender di `<body>` (`FloatingTip`) jadi tidak
  terpotong, dijepit ke layar, dan meluncur dengan pegas.
- **Tabel parameter MAUT.** Tiap atribut menampilkan angka terukur (mis. `+18,6 K`, `2 dari 3 malam`), nilai u, bobot,
  sumbangan w × u, angka pendukung (suhu tiap kanal, latar, σ, LST/TS/T2M, U puncak per malam), skala normalisasi, dan
  rumus `U = Σ w·u ÷ Σ w` dengan angkanya. Sorot batang u untuk melihat rumus normalisasinya.
- **Data.** `EvidenceImg.thermal` (grid `ThermalCrop`, 4 kanal × 20 × 20 sel) dan `ClusterDetail.attribute_details` adalah
  bagian kontrak resmi (`backend.html`); keduanya opsional (tanpa itu citra tampil tanpa tooltip dan tabel hanya
  berisi u dan bobot; `u_N` tetap dihitung dari tetangga, dan `EvidenceImg.bbox` yang hilang dianggap ±0,2° dari
  koordinat kelompok). Skema ada di tab Kontrak API. Mode mock membangun citra, tooltip, dan tabel dari satu grid suhu
  fiktif, jadi angkanya selalu sepakat dan terhubung ke `u` di fixture (`src/mock/thermal.ts`).

## Gerak

Animasi memakai [`motion`](https://motion.dev) (pengganti framer-motion). Semua komponen memakai `m` dari `src/motion`
(bukan `motion`), dibungkus `LazyMotion` di `MotionProvider`: inti ±17 KB gzip ikut bundel awal, fitur gerak penuh
(animasi, gestur, layout, drag; ±20 KB gzip) dimuat belakangan sebagai chunk `features`. Bila chunk itu gagal
dimuat, `<html>` diberi kelas `no-motion` dan halaman tampil tanpa gerak.

| Di mana | Geraknya |
|---|---|
| Pindah halaman, kartu, bar, grafik, grid tetangga | masuk dengan pegas saat terlihat (`reveal`, `whileInView`); garis grafik tergambar, bar tumbuh |
| Tautan navigasi, tombol ID/EN | latar aktif meluncur antar item (`layoutId`) |
| Dropdown (`Select`) | daftar membuka dari sisi tombol, sorotan opsi meluncur mengikuti panah/pointer |
| Kalender malam | muncul dari pojok pemicu; pindah bulan menggeser kisi sesuai arah, tinggi tetap 6 baris |
| Panel Lapisan, inspektur piksel | muncul/hilang; inspektur meluncur ke posisi baru saat panel Lapisan dibuka (`LayoutGroup`) |
| Daftar kelompok | ganti urutan/filter → kartu meluncur ke tempatnya; kartu baru muncul bertahap, yang hilang menyusut |
| Bottom sheet (layar < 1024 px) | diseret lewat gagang (`Sheet`): lepas pelan → ke posisi terdekat, lemparan → menurut arah; isi tetap bisa digulir |
| Panel keputusan | blok alasan/konfirmasi/galat memudar masuk-keluar, elemen di bawahnya meluncur |
| Tombol, chip, sakelar, `<details>` | CSS murni: tekan memantul (`--ease-spring`), kenop sakelar, `<details>` membuka dengan tinggi mengalir |

Preferensi sistem *reduced motion* dan mode ringan memakai `MotionConfig reducedMotion`: gerak transform/layout
langsung ke nilai akhir, hanya opacity yang tetap memudar. Preset pegas ada di `src/motion/presets.ts`.

## Catatan teknis

- MapLibre 6 memuat worker modul dari file terpisah. Plugin `maplibreWorker` di `vite.config.ts`
  menyajikan `maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs` apa adanya di `/maplibre/`
  (dev) dan menyalinnya ke `dist/maplibre/` (build), lalu `setWorkerUrl` menunjuk ke sana.
- Basemap: OpenFreeMap `positron` (terang) / `dark` (gelap), tanpa API key; ganti tema = `setStyle`
  lalu semua layer data dipasang ulang di `style.load`.
- Huruf IBM Plex dibundel lewat `@fontsource` (tanpa Google Fonts).
