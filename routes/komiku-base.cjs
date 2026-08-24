/**
 * Pabrik router Komiku per tipe konten (manga / manhwa / manhua).
 * Dipakai oleh manga.js, manhwa.js, dan manhua.js.
 */
const express = require('express');
const komiku = require('../core/komiku');

function makeKomikuRouter(TYPE) {
    const router = express.Router();
    const CREATOR = global.creator || 'Zunime';

    const ok = (res, data, extra = {}) => res.json({ status: true, creator: CREATOR, type: TYPE, ...extra, data });
    const fail = (res, err, message = 'Gagal mengambil data.') =>
        res.status(500).json({ status: false, creator: CREATOR, type: TYPE, message, error: err.message });

    router.get('/browse', async (req, res) => {
        try {
            ok(res, await komiku.browse({
                tipe: TYPE,
                orderby: String(req.query.order || 'popular'),
                page: parseInt(req.query.page) || 1,
                genre: String(req.query.genre || '')
            }), { page: parseInt(req.query.page) || 1 });
        } catch (e) { fail(res, e); }
    });

    router.get('/search', async (req, res) => {
        try {
            const q = String(req.query.q || '').trim();
            if (!q) return res.status(400).json({ status: false, creator: CREATOR, message: 'Parameter "q" wajib diisi!' });
            ok(res, await komiku.search(q));
        } catch (e) { fail(res, e); }
    });

    router.get('/detail', async (req, res) => {
        try {
            const slug = String(req.query.slug || '').trim();
            if (!slug) return res.status(400).json({ status: false, creator: CREATOR, message: 'Parameter "slug" wajib diisi!' });
            ok(res, await komiku.detail(slug));
        } catch (e) { fail(res, e); }
    });

    router.get('/chapter', async (req, res) => {
        try {
            const url = String(req.query.url || '').trim();
            if (!url) return res.status(400).json({ status: false, creator: CREATOR, message: 'Parameter "url" wajib diisi!' });
            ok(res, await komiku.chapter(url));
        } catch (e) { fail(res, e, 'Gagal mengambil isi chapter.'); }
    });

    router.get('/genres', (req, res) => {
        ok(res, komiku.GENRES.map(g => ({
            slug: g,
            label: g.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        })));
    });

    return router;
}

module.exports = { makeKomikuRouter };
