/**
 * Apinime — API scraping anime (ylnime.com) & manga (komiku.org) untuk Zunime.
 * Siap deploy ke Vercel (@vercel/node) atau jalan mandiri: npm start
 */
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
    global.creator = global.creator || 'Zunime';
    next();
});

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/anime', require('./routes/anime'));
app.use('/manga', require('./routes/manga'));
app.use('/manhwa', require('./routes/manhwa'));
app.use('/manhua', require('./routes/manhua'));

// ── Index ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    const base = `${req.protocol}://${req.get('host')}`;
    res.json({
        status: true,
        creator: global.creator,
        name: 'Apinime',
        description: 'API scraping anime & manga untuk Zunime',
        endpoints: {
            anime: {
                home: `${base}/anime/home`,
                list: `${base}/anime/list?type=ongoing|completed|movie|baru|rekomendasi`,
                search: `${base}/anime/search?q=`,
                genres: `${base}/anime/genres`,
                genre: `${base}/anime/genre?g=&page=`,
                jadwal: `${base}/anime/jadwal`,
                detail: `${base}/anime/detail?slug=`,
                streams: `${base}/anime/streams?slug=&ep=`
            },
            manga: {
                browse: `${base}/manga/browse?order=&page=&genre=`,
                search: `${base}/manga/search?q=`,
                detail: `${base}/manga/detail?slug=`,
                chapter: `${base}/manga/chapter?url=`,
                genres: `${base}/manga/genres`
            },
            manhwa: 'sama seperti /manga/*',
            manhua: 'sama seperti /manga/*'
        }
    });
});

app.use((req, res) => {
    res.status(404).json({ status: false, creator: global.creator, message: 'Endpoint tidak ditemukan.' });
});

// Error handler terakhir agar Vercel tetap balikin JSON.
app.use((err, req, res, next) => {
    console.error(err);
    if (!res.headersSent) {
        res.status(500).json({ status: false, creator: global.creator, message: 'Server error.', error: err.message });
    }
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`🚀 Apinime berjalan di http://localhost:${PORT}`));
}

module.exports = app;
