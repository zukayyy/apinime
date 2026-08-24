/**
 * /newupdate/* — Gabungan update terbaru dari semua sumber.
 */
const express = require('express');
const yn = require('../core/samehadaku');
const komiku = require('../core/komiku');

const router = express.Router();
const CREATOR = global.creator || 'Zunime';

router.get('/all', async (req, res) => {
    try {
        const [anime, manga, manhwa, manhua] = await Promise.allSettled([
            yn.listByType('baru'),
            komiku.browse({ tipe: 'manga', orderby: 'update', page: 1 }),
            komiku.browse({ tipe: 'manhwa', orderby: 'update', page: 1 }),
            komiku.browse({ tipe: 'manhua', orderby: 'update', page: 1 })
        ]);
        const val = r => (r.status === 'fulfilled' ? r.value : []);
        res.json({
            status: true,
            creator: CREATOR,
            data: {
                anime: val(anime),
                manga: val(manga),
                manhwa: val(manhwa),
                manhua: val(manhua)
            }
        });
    } catch (e) {
        res.status(500).json({
            status: false,
            creator: CREATOR,
            message: 'Gagal mengambil update terbaru.',
            error: e.message
        });
    }
});

module.exports = router;
