/**
 * Metadata seluruh endpoint — dipakai oleh halaman /docs.
 */
module.exports = [
    {
        group: 'Anime — samehadaku.li',
        icon: '📺',
        items: [
            { m: 'GET', p: '/anime/home', d: 'Kartu anime di beranda samehadaku.' },
            {
                m: 'GET', p: '/anime/list?type=ongoing',
                d: 'Daftar anime berdasarkan tipe.',
                params: { type: 'ongoing · completed · movie · baru · rekomendasi (default: ongoing)' }
            },
            { m: 'GET', p: '/anime/search?q=one%20piece', d: 'Cari judul anime.', params: { q: 'kata kunci' } },
            { m: 'GET', p: '/anime/genres', d: 'Daftar semua genre.' },
            { m: 'GET', p: '/anime/genre?g=action&page=1', d: 'Anime per genre + paginasi.', params: { g: 'slug genre', page: 'nomor halaman' } },
            { m: 'GET', p: '/anime/jadwal', d: 'Rilisan berjalan (samehadaku tidak punya jadwal per hari).' },
            { m: 'GET', p: '/anime/detail?slug=one-piece', d: 'Detail seri + daftar episode (id, label, nomor).', params: { slug: 'slug seri dari kartu' } },
            {
                m: 'GET', p: '/anime/streams?slug=one-piece&ep=/one-piece-episode-1175-subtitle-indonesia/',
                d: 'Embed video episode (Blogger — diputar app via WebView). ⚠️ "ep" adalah ID path dari endpoint detail, bukan nomor episode!',
                params: { slug: 'slug seri', ep: 'ID episode dari detail' }
            }
        ]
    },
    {
        group: 'Manga — komiku.org',
        icon: '🇯🇵',
        prefixNote: 'Endpoint yang sama tersedia di /manhwa/* dan /manhua/* dengan tipe terpisah.',
        items: [
            {
                m: 'GET', p: '/manga/browse?order=popular&page=1&genre=action',
                d: 'Daftar komik per tipe.',
                params: { order: 'popular · update · date', page: 'nomor halaman', genre: 'opsional, slug genre' }
            },
            { m: 'GET', p: '/manga/search?q=one%20piece', d: 'Cari judul komik.', params: { q: 'kata kunci' } },
            { m: 'GET', p: '/manga/detail?slug=', d: 'Detail + daftar chapter.', params: { slug: 'slug komik dari kartu' } },
            { m: 'GET', p: '/manga/chapter?url=/slug-chapter-1/', d: 'Isi chapter: gambar + prev/next.', params: { url: 'path atau URL lengkap chapter' } },
            { m: 'GET', p: '/manga/genres', d: 'Daftar slug genre Komiku.' }
        ]
    },
    {
        group: 'Manhwa & Manhua — komiku.org',
        icon: '🇰🇷🇨🇳',
        items: [
            { m: 'GET', p: '/manhwa/browse?order=popular', d: 'Daftar manhwa (Korea).' },
            { m: 'GET', p: '/manhua/browse?order=update', d: 'Daftar manhua (Tiongkok).' },
            { m: 'GET', p: '/manhwa/search?q=solo%20leveling', d: 'Cari manhwa.' },
            { m: 'GET', p: '/manhua/detail?slug=', d: 'Detail manhua.' },
            { m: 'GET', p: '/manhwa/chapter?url=', d: 'Isi chapter manhwa.' }
        ]
    },
    {
        group: 'Gabungan',
        icon: '🔄',
        items: [
            {
                m: 'GET', p: '/newupdate/all',
                d: 'Update terbaru SEMUA sumber sekaligus: anime baru, manga, manhwa, dan manhua.'
            },
            { m: 'GET', p: '/', d: 'Index JSON berisi daftar endpoint.' }
        ]
    }
];
