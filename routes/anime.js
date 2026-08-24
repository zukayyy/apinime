/**
 * /anime/* — Semua endpoint sumber Samehadaku (anime).
 */
const express = require('express');
const yn = require('../core/samehadaku');

const router = express.Router();
const CREATOR = global.creator || 'Zunime';

const ok = (res, data, extra = {}) => res.json({ status: true, creator: CREATOR, ...extra, data });
const fail = (res, err, message = 'Gagal mengambil data.') =>
    res.status(500).json({ status: false, creator: CREATOR, message, error: err.message });

router.get('/home', async (req, res) => {
    try {
        ok(res, await yn.listByType('home'));
    } catch (e) { fail(res, e); }
});

router.get('/list', async (req, res) => {
    try {
        const type = String(req.query.type || 'ongoing').toLowerCase();
        ok(res, await yn.listByType(type), { type });
    } catch (e) { fail(res, e); }
});

router.get('/search', async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        if (!q) return res.status(400).json({ status: false, creator: CREATOR, message: 'Parameter "q" wajib diisi!' });
        ok(res, await yn.search(q));
    } catch (e) { fail(res, e); }
});

router.get('/genres', async (req, res) => {
    try {
        ok(res, await yn.genres());
    } catch (e) { fail(res, e); }
});

router.get('/genre', async (req, res) => {
    try {
        const g = String(req.query.g || '').trim();
        if (!g) return res.status(400).json({ status: false, creator: CREATOR, message: 'Parameter "g" wajib diisi!' });
        ok(res, await yn.byGenre(g, parseInt(req.query.page) || 1), { genre: g });
    } catch (e) { fail(res, e); }
});

router.get('/jadwal', async (req, res) => {
    try {
        ok(res, await yn.schedule());
    } catch (e) { fail(res, e); }
});

router.get('/detail', async (req, res) => {
    try {
        const slug = String(req.query.slug || '').trim();
        if (!slug) return res.status(400).json({ status: false, creator: CREATOR, message: 'Parameter "slug" wajib diisi!' });
        ok(res, await yn.detail(slug));
    } catch (e) { fail(res, e); }
});

router.get('/streams', async (req, res) => {
    try {
        const slug = String(req.query.slug || '').trim();
        const ep = String(req.query.ep || '').trim();
        if (!slug || !ep) {
            return res.status(400).json({
                status: false,
                creator: CREATOR,
                message: 'Parameter "slug" dan "ep" wajib diisi. "ep" adalah ID internal dari endpoint /anime/detail (bukan nomor episode).'
            });
        }
        const data = await yn.streams(slug, ep);
        if (!data.sources.length) {
            return res.status(404).json({
                status: false,
                creator: CREATOR,
                message: 'Video episode ini belum tersedia. Coba episode lain atau kualitas berbeda.'
            });
        }
        ok(res, data);
    } catch (e) { fail(res, e, 'Gagal mengambil sumber video.'); }
});

module.exports = router;
