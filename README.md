# Apinime

API scraping untuk aplikasi **Zunime** — sumber anime dari **ylnime.com** dan manga/manhwa/manhua dari **komiku.org**.

Siap deploy ke **Vercel** (satu fungsi `server.js` via `@vercel/node`) atau jalan mandiri.

## Menjalankan lokal

```bash
npm install
npm start          # http://localhost:3000
npm test           # smoke test semua endpoint utama (server harus jalan)
```

## Endpoint — Anime (ylnime.com)

| Endpoint | Keterangan |
|---|---|
| `/anime/home` | Kartu beranda |
| `/anime/list?type=` | `ongoing` · `completed` · `movie` · `baru` · `rekomendasi` |
| `/anime/search?q=` | Cari judul anime |
| `/anime/genres` | Daftar genre |
| `/anime/genre?g=action&page=1` | Anime per genre + paginasi |
| `/anime/jadwal` | Jadwal rilis per hari |
| `/anime/detail?slug=` | Detail + daftar episode |
| `/anime/streams?slug=&ep=` | Sumber video per kualitas |

## Endpoint — Komiku (`/manga/*`, `/manhwa/*`, `/manhua/*`)

| Endpoint | Keterangan |
|---|---|
| `/browse?order=&page=&genre=` | `order`: popular / update / date |
| `/search?q=` | Cari judul |
| `/detail?slug=` | Detail + daftar chapter |
| `/chapter?url=` | Isi chapter: gambar, prev, next |
| `/genres` | Daftar slug genre |

## Contoh respons

```json
{
  "status": true,
  "creator": "Zunime",
  "data": [
    { "slug": "...", "title": "...", "cover": "...", "rating": "8.27", "status": "Completed" }
  ]
}
```

## Deploy ke Vercel

1. Push folder ini ke repo GitHub.
2. Import di Vercel → Framework Preset: *Other* → deploy.
3. Semua route otomatis diarahkan ke `server.js` oleh `vercel.json`.
