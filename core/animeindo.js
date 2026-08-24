/**
 * Core scraper animeindo.pro untuk Zunime API.
 * Kontrak fungsi sama dengan core/samehadaku.js sehingga route tidak berubah.
 *
 * Video: episode memuat iframe putarin.com/e/{CODE}; config player terenkripsi
 * AES-256-GCM (__PX) dengan kunci sekali-pakai dari /api/pk. Hasil dekripsi
 * berisi endpoint HLS (/api/hls?t=...) yang bisa diputar ExoPlayer langsung.
 */
const axios = require('axios');
const crypto = require('crypto');
const cheerio = require('cheerio');

const BASE = 'https://animeindo.pro';
const PLAYER_BASE = 'https://putarin.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getHtml(url) {
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const r = await axios.get(url, {
                headers: { 'User-Agent': UA, 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' },
                timeout: 30000,
                maxRedirects: 5,
                validateStatus: null
            });
            if (r.status >= 400 && r.status !== 404) { lastErr = new Error(`HTTP ${r.status}`); await sleep(800 * (attempt + 1)); continue; }
            return r.data;
        } catch (e) { lastErr = e; await sleep(800 * (attempt + 1)); }
    }
    throw lastErr || new Error(`Gagal memuat: ${url}`);
}

function decodeEntities(str) {
    if (!str) return '';
    const $ = cheerio.load(`<div>${str}</div>`);
    return $('div').text().replace(/\s+/g, ' ').trim();
}

/** Parser universal kartu a.ai-card (home/ongoing/completed/search/genre). */
function parseCards($) {
    const out = [];
    const seen = new Set();
    $('a.ai-card').each((_, el) => {
        const card = $(el);
        const href = card.attr('href') || '';
        // Terima link series maupun episode; episode diubah jadi slug series.
        let m = href.match(/\/anime\/([^"/?#]+)\/?$/);
        if (!m) m = href.match(/\/nonton\/([^"/?#]+)-episode-\d+(?:-\d+)?\/?$/);
        const slug = m ? m[1] : '';
        if (!slug || seen.has(slug)) return;
        const img = card.find('img').first();
        const title = decodeEntities(card.find('span.t').first().text() || img.attr('alt') || '') || slug;
        const cover = img.attr('src') || null;
        const type = card.find('span.m').first().text().trim() || null;
        let rating = null;
        const rateTxt = card.find('span.rate').first().text();
        const rm = rateTxt.match(/(\d[.,]\d{1,2})/);
        if (rm) rating = rm[1].replace(',', '.');
        seen.add(slug);
        out.push({ slug, title, cover, rating, status: null });
    });
    return out;
}

async function list(path) {
    const html = await getHtml(BASE + path);
    const $ = cheerio.load(html);
    return parseCards($);
}

const LIST_TYPES = {
    home: '/',
    ongoing: '/ongoing/',
    completed: '/completed/',
    movie: '/movie-list/',
    baru: '/',
    rekomendasi: '/anime-list/'
};

async function listByType(type) {
    const path = LIST_TYPES[type] || LIST_TYPES.ongoing;
    return list(path);
}

async function search(q) {
    if (!q || !q.trim()) return [];
    const html = await getHtml(`${BASE}/?s=${encodeURIComponent(q.trim())}`);
    const $ = cheerio.load(html);
    return parseCards($);
}

async function genres() {
    try {
        const html = await getHtml(BASE + '/');
        const found = [];
        for (const m of html.matchAll(/href="https:\/\/animeindo\.pro\/genre\/([^"/]+)\/"[^>]*>([^<]{1,40})</g)) {
            const label = m[2].trim();
            if (label && !found.some(g => g.value === m[1])) found.push({ value: m[1], label });
        }
        if (found.length) return found;
    } catch { /* fallback */ }
    return ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Romance', 'Sci-Fi', 'Slice of Life'].map(g => ({ value: g.toLowerCase(), label: g }));
}

async function byGenre(genre, page = 1) {
    const g = String(genre || '').toLowerCase().trim().replace(/\s+/g, '-');
    const p = Number(page) > 1 ? `/page/${Number(page)}/` : '/';
    const html = await getHtml(`${BASE}/genre/${encodeURIComponent(g)}${p}`);
    const $ = cheerio.load(html);
    return parseCards($);
}

function epNumberFromPath(p) {
    const m = (p || '').match(/-episode-(\d+(?:-\d+)?)/i);
    return m ? parseFloat(m[1].replace('-', '.')) : null;
}

async function detail(slug) {
    const cleanSlug = String(slug).replace(/\/+$/, '');
    const html = await getHtml(`${BASE}/anime/${cleanSlug}/`);
    const $ = cheerio.load(html);

    const title = decodeEntities($('h1').first().text()) ||
        ($('meta[property="og:title"]').attr('content') || '').trim() || cleanSlug;

    // Info seri: cari pasangan label:value pada area info.
    let status = null;
    $('li, span, div').each((_, el) => {
        if (status) return;
        const t = $(el).clone().children().remove().end().text().replace(/\s+/g, ' ').trim();
        const m = t.match(/^Status\s*:?\s*(.+)$/i);
        if (m && m[1].length < 30) status = m[1].trim();
    });

    const genres = [];
    $('.ai-genres a[href*="/genre/"], a[href*="/genre/"]').each((_, el) => {
        const g = $(el).text().trim().replace(/,+$/, '');
        if (g && g.length < 40 && !genres.includes(g)) genres.push(g);
    });

    // Sinopsis: paragraf terpanjang setelah heading sinopsis.
    let synopsis = null;
    $('p').each((_, el) => {
        if (synopsis) return;
        const t = $(el).text().replace(/\s+/g, ' ').trim();
        if (t.length > 80) synopsis = t;
    });

    // Episode: semua /nonton/{series}-episode-N/.
    const epsMap = new Map();
    const prefixRe = new RegExp(`^/nonton/${cleanSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-episode-(\\d+(?:-\\d+)?)`, 'i');
    $('a[href*="/nonton/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const rel = href.replace(/^https?:\/\/[^/]+/, '');
        const m = rel.match(prefixRe);
        if (!m) return;
        const num = parseFloat(m[1].replace('-', '.'));
        const id = '/nonton/' + cleanSlug + '-episode-' + m[1] + '/';
        if (epsMap.has(id)) return;
        epsMap.set(id, { id, label: `Episode ${m[1].replace('-', '.')}`, number: num });
    });
    const episodes = [...epsMap.values()].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

    const cover = $('img').first().attr('src') || null;

    return { slug: cleanSlug, title, cover, synopsis, genres, status, episodes };
}

/**
 * Stream putarin.com: iframe → __PX (AES-256-GCM) → kunci /api/pk → HLS URL.
 */
async function resolvePutarin(code) {
    const pageHtml = await getHtml(`${PLAYER_BASE}/e/${code}`);
    const pxMatch = pageHtml.match(/window\.__PX=(\{.*?\});try\{window\.__PK/) ||
                    pageHtml.match(/window\.__PX=(\{.*?\});<\/script>/s);
    if (!pxMatch) throw new Error('Config player tidak ditemukan');
    const cfg = JSON.parse(pxMatch[1]);

    // Kunci sekali-pakai; kirim cookie dari halaman player bila ada.
    const pageRes = await axios.get(`${PLAYER_BASE}/e/${code}`, {
        headers: { 'User-Agent': UA }, timeout: 25000, validateStatus: null });
    const cookies = (pageRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    const pkRes = await axios.get(`${PLAYER_BASE}/api/pk?n=${encodeURIComponent(cfg.n)}`, {
        headers: { 'User-Agent': UA, Referer: `${PLAYER_BASE}/`, ...(cookies ? { Cookie: cookies } : {}) },
        timeout: 25000, responseType: 'text' });
    const keyHex = String(pkRes.data).trim();
    if (keyHex.length < 64) throw new Error('Kunci player tidak valid');

    const buf = Buffer.from(cfg.d, 'base64');
    const iv = buf.slice(0, 12);
    const ct = buf.slice(12, buf.length - 16);
    const tag = buf.slice(buf.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
    decipher.setAuthTag(tag);
    const player = JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8'));

    const file = player.file || player.source || '';
    if (!file) throw new Error('URL video tidak ada di config');
    return file.startsWith('http') ? file : PLAYER_BASE + file;
}

async function streams(_slug, epPath) {
    let target = String(epPath || _slug || '');
    if (!target.startsWith('http')) target = BASE + (target.startsWith('/') ? target : '/' + target);

    const body = await getHtml(target);
    const $ = cheerio.load(body);

    const pageTitle = (body.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const epMatch = pageTitle.match(/Episode\s+\d+(?:-\d+)?/i);
    let seriesTitle = pageTitle.split(/Episode\s+\d+/i)[0].replace(/Subtitle\s+Indonesia/gi, '').trim();
    if (!seriesTitle) seriesTitle = pageTitle;

    // Iframe player utama (putarin.com/e/{CODE}).
    let videoUrl = null;
    const iframeSrc = ($('iframe[src*="putarin"]').first().attr('src')) ||
                      (body.match(/<iframe[^>]*src="(https:\/\/putarin\.com\/e\/[^"]+)"/i) || [])[1];
    if (iframeSrc) {
        const codeMatch = iframeSrc.match(/\/e\/([^"?/]+)/);
        if (codeMatch) videoUrl = await resolvePutarin(codeMatch[1]);
    }

    const sources = videoUrl ? [{ reso: 'HLS', url: videoUrl }] : [];
    return {
        seriesTitle,
        episodeLabel: epMatch ? epMatch[0].trim() : 'Episode',
        qualities: sources.length ? ['HLS'] : [],
        sources
    };
}

/** Jadwal asli per hari dari section #jadwal di halaman depan. */
async function schedule() {
    const html = await getHtml(BASE + '/');
    const $ = cheerio.load(html);
    const dayNames = { 1: 'Minggu', 2: 'Senin', 3: 'Selasa', 4: 'Rabu', 5: 'Kamis', 6: 'Jumat', 7: 'Sabtu' };
    const days = [];
    $('div.ai-sched-day').each((_, el) => {
        const sec = $(el);
        const dayNum = parseInt(sec.attr('data-day') || '0', 10);
        if (!dayNum) return;
        const items = [];
        const seen = new Set();
        sec.find('a[href*="/anime/"]').each((__, a) => {
            const href = $(a).attr('href') || '';
            const m = href.match(/\/anime\/([^"/?#]+)\/?$/);
            if (!m || seen.has(m[1])) return;
            seen.add(m[1]);
            const img = $(a).find('img').first();
            const title = ($(a).find('strong').first().text() || img.attr('alt') || m[1]).trim();
            items.push({ slug: m[1], title: decodeEntities(title), cover: img.attr('src') || null, rating: null, status: null });
        });
        if (items.length) days.push({ day: dayNames[dayNum] || String(dayNum), items });
    });
    // Urutkan Senin..Minggu seperti tab situs.
    const order = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    days.sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day));
    return days;
}

/**
 * Filter minimal yang didukung animeindo (dipakai app untuk dropdown).
 */
async function filters() {
    return {
        status: [
            { value: '', label: 'Semua' },
            { value: 'ongoing', label: 'Ongoing' },
            { value: 'completed', label: 'Completed' }
        ],
        type: [
            { value: '', label: 'Semua' },
            { value: 'movie', label: 'Movie' }
        ],
        sub: [{ value: '', label: 'Sub Indo' }],
        order: [{ value: 'update', label: 'Terbaru' }]
    };
}

/**
 * Arsip dengan filter: petakan ke halaman bawaan animeindo.
 */
async function browse({ status = '', type = '', order = 'update', genre = '', page = 1 } = {}) {
    if (genre) return byGenre(genre, page);
    if (type === 'movie') return list('/movie-list/');
    if (status === 'completed') return list('/completed/');
    if (status === 'ongoing') return list(`/ongoing${Number(page) > 1 ? `/page/${Number(page)}` : ''}/`);
    return listByType('baru');
}

module.exports = { BASE, getHtml, list, listByType, LIST_TYPES, search, genres, byGenre, detail, streams, schedule, browse, filters, parseCards, decodeEntities };
