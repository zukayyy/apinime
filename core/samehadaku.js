/**
 * Core scraper samehadaku.li untuk Zunime API.
 * Menggantikan ylnime sebagai sumber anime dengan kontrak fungsi yang sama.
 */
const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://samehadaku.li';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const cookieJar = new Map();
function cookieHeader() {
    return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function fetchResponse(url) {
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': UA,
                    'Referer': BASE + '/',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
                    ...(cookieJar.size ? { 'Cookie': cookieHeader() } : {})
                },
                timeout: 30000,
                maxRedirects: 5,
                validateStatus: null
            });
            if (response.status === 403 || response.status === 429) {
                lastErr = new Error(`HTTP ${response.status}`);
                await sleep(1500);
                continue;
            }
            if (response.status >= 400) {
                lastErr = new Error(`HTTP ${response.status}`);
                continue;
            }
            const setCookies = response.headers['set-cookie'] || [];
            for (const sc of setCookies) {
                const [pair] = sc.split(';');
                const idx = pair.indexOf('=');
                if (idx > 0) cookieJar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
            }
            return response;
        } catch (e) {
            lastErr = e;
            await sleep(800 * (attempt + 1));
        }
    }
    throw lastErr || new Error(`Gagal memuat: ${url}`);
}

async function getHtml(pathOrUrl) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : BASE + (pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl);
    const response = await fetchResponse(url);
    return response.data;
}

function decodeEntities(str) {
    if (!str) return '';
    const $ = cheerio.load(`<div>${str}</div>`);
    return $('div').text().replace(/\s+/g, ' ').trim();
}

/** Slug dari URL series: https://samehadaku.li/anime/{slug}/ → {slug} */
function slugFromSeriesUrl(href) {
    const m = (href || '').match(/\/anime\/([^/?#]+)\/?$/);
    return m ? m[1] : '';
}

/**
 * Parser kartu universal tema Madara (.bs > .bsx) — dipakai di home,
 * halaman /anime/, hasil pencarian, dan halaman genre.
 */
function parseCards($) {
    const out = [];
    const seen = new Set();
    $('article.bs .bsx').each((_, el) => {
        const card = $(el);
        // Anchor utama bisa a.tip (archive/search) atau a biasa dengan href /anime/.
        const a = card.find('a[href*="/anime/"]').first();
        const slug = slugFromSeriesUrl(a.attr('href') || '');
        if (!slug || seen.has(slug)) return;
        let title = a.attr('title') || card.find('img').attr('alt') || a.text() || '';
        title = decodeEntities(title);
        const img = card.find('img').first();
        const cover = img.attr('src') && !img.attr('src').startsWith('data:')
            ? img.attr('src')
            : (img.attr('data-src') || img.attr('data-lazy-src') || null);
        const type = card.find('.typez').first().text().trim() || null;
        // Status ada di span.epx ("Ongoing", "Completed", dst).
        let status = null;
        card.find('.bt span, span.epx').each((__, sp) => {
            if (status) return;
            const t = $(sp).text().trim();
            if (/^(ongoing|completed|hiatus)$/i.test(t)) status = t;
        });
        let rating = null;
        card.find('.score, .rt i, .rating').each((__, sp) => {
            if (rating) return;
            const t = $(sp).text().trim();
            const m = t.match(/\d[.,]\d{1,2}/);
            if (m) rating = m[0].replace(',', '.');
        });
        seen.add(slug);
        out.push({ slug, title, cover, rating, status });
    });
    return out;
}

async function list(pagePath) {
    const html = await getHtml(pagePath);
    const $ = cheerio.load(html);
    return parseCards($);
}

const LIST_TYPES = {
    home: '/',
    ongoing: '/anime/?status=ongoing&order=update',
    completed: '/anime/?status=completed&order=update',
    movie: '/anime/?type=movie&order=update',
    baru: '/',
    rekomendasi: '/anime/?order=update'
};

/**
 * Kartu di beranda adalah kartu EPISODE ("{Series} Episode N Subtitle Indonesia").
 * Ubah menjadi kartu series agar konsisten dengan kontrak API.
 */
function parseEpisodeCards($) {
    const out = [];
    const seen = new Set();
    $('article.bs .bsx').each((_, el) => {
        const card = $(el);
        const a = card.find('a[href*="-episode-"]').first();
        const href = a.attr('href') || '';
        const m = href.match(/\/([^/?#]+)-episode-\d+(?:-\d+)?-subtitle-indonesia\/?$/);
        if (!m) return;
        const slug = m[1];
        if (!slug || seen.has(slug)) return;
        const title = decodeEntities(a.attr('title') || '')
            .replace(/\s*Episode\s+\d+(?:-\d+)?\s*/i, ' ')
            .replace(/Subtitle\s+Indonesia/i, '')
            .trim() || slug;
        const img = card.find('img').first();
        const rawSrc = img.attr('src') || '';
        const cover = !rawSrc.startsWith('data:') ? rawSrc
            : (img.attr('data-src') || img.attr('data-lazy-src') || null);
        seen.add(slug);
        out.push({ slug, title, cover, rating: null, status: null });
    });
    return out;
}

async function listByType(type) {
    if (type === 'baru' || type === 'home') {
        const html = await getHtml('/');
        return parseEpisodeCards(cheerio.load(html));
    }
    const path = LIST_TYPES[type] || LIST_TYPES.ongoing;
    return list(path);
}

async function search(q) {
    if (!q || !q.trim()) return [];
    const html = await getHtml(`/?s=${encodeURIComponent(q.trim())}`);
    const $ = cheerio.load(html);
    return parseCards($);
}

async function genres() {
    try {
        const html = await getHtml('/anime/');
        const found = [];
        const $ = cheerio.load(html);
        // Dropdown filter genre di halaman daftar.
        $('select option').each((_, el) => {
            const v = ($(el).attr('value') || '').trim().toLowerCase();
            const t = $(el).text().trim();
            if (v && /^[a-z0-9-]+$/.test(v) && t && t.toLowerCase() !== 'all' && !found.includes(t)) found.push(t);
        });
        if (found.length) return found;
    } catch { /* fallback di bawah */ }
    return ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Sci-Fi', 'Romance', 'School',
        'Shounen', 'Seinen', 'Slice of Life', 'Supernatural', 'Mystery', 'Psychological', 'Sports', 'Isekai'];
}

async function byGenre(genre, page = 1) {
    const g = String(genre || '').toLowerCase().trim().replace(/\s+/g, '-');
    const p = Number(page) > 1 ? `/page/${Number(page)}/` : '/';
    const html = await getHtml(`/genres/${encodeURIComponent(g)}${p}`);
    const $ = cheerio.load(html);
    return parseCards($);
}

/** Ambil nomor episode dari path episode. */
function epNumber(path) {
    const m = (path || '').match(/-episode-(\d+(?:-\d+)?)/i);
    return m ? parseFloat(m[1].replace('-', '.')) : null;
}

async function detail(slug) {
    const cleanSlug = String(slug).replace(/\/+$/, '');
    const html = await getHtml(`/anime/${cleanSlug}/`);
    const $ = cheerio.load(html);

    const title = decodeEntities($('h1.entry-title').first().text()) ||
        ($('meta[property="og:title"]').attr('content') || '').replace(' | Samehadaku', '').trim() || cleanSlug;

    // Info seri: blok .spe berisi <span><b>Status:</b> Completed</span> dll.
    let status = null;
    $('.spe span, .infox span').each((_, el) => {
        if (status) return;
        const t = $(el).text().replace(/\s+/g, ' ').trim();
        const m = t.match(/^Status:\s*(.+)$/i);
        if (m) status = m[1].trim();
    });

    // Genre hanya dari area info (hindari footer).
    const genres = [];
    $('.infox a[href*="/genres/"], .spe a[href*="/genres/"]').each((_, el) => {
        const g = $(el).text().trim().replace(/,+$/, '');
        if (g && g.length < 40 && !genres.includes(g)) genres.push(g);
    });

    // Sinopsis: paragraf pertama di area sinopsis / entry-content.
    let synopsis = null;
    const synEl = $('.sinopsis, .entry-content-single, .desc, [itemprop="description"]').first();
    if (synEl.length) {
        synopsis = decodeEntriesText(synEl, $);
    }
    if (!synopsis) {
        $('p').each((_, el) => {
            if (synopsis) return;
            const t = $(el).text().replace(/\s+/g, ' ').trim();
            if (t.length > 80) synopsis = t;
        });
    }

    // Daftar episode: semua link "-episode-N-" milik series ini.
    const epsMap = new Map();
    const prefixRe = new RegExp(`^/?${cleanSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-episode-(\\d+(?:-\\d+)?)`, 'i');
    $('a[href*="-episode-"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const rel = href.replace(BASE, '').replace(/^https?:\/\/[^/]+/, '');
        const m = rel.match(prefixRe);
        if (!m) return;
        const num = parseFloat(m[1].replace('-', '.'));
        const labelNum = m[1].replace('-', '.');
        const id = '/' + rel.replace(/^\/+|\/+$/g, '') + '/';
        if (epsMap.has(id)) return;
        epsMap.set(id, { id, label: `Episode ${labelNum}`, number: num });
    });

    const episodes = [...epsMap.values()].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

    // Cover dari thumb area.
    const cover = $('.thumb img').first().attr('src')
        || $('.wp-post-image').first().attr('data-src')
        || $('.wp-post-image').first().attr('src')
        || null;

    return { slug: cleanSlug, title, cover, synopsis, genres, status, episodes };
}

function decodeEntriesText(el, $) {
    const clone = el.clone();
    clone.find('a, script, style').remove();
    const t = clone.text().replace(/\s+/g, ' ').trim();
    return t.length > 20 ? t : null;
}

/**
 * Stream: kumpulkan semua embed mirror (iframe default + opsi base64).
 * Samehadaku memakai embed Blogger; app menanganinya lewat WebView.
 * Kompatibel dengan pemanggilan lama: streams(slug, epId) — slug diabaikan
 * karena ID episode Samehadaku sudah berupa path lengkap.
 */
async function streams(_slug, epPath) {
    let target = String(epPath || _slug || '');
    if (!target.startsWith('http')) target = BASE + (target.startsWith('/') ? target : '/' + target);

    const body = await getHtml(target);

    const pageTitle = (body.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    // Pola judul: "{Series} Episode N Subtitle Indonesia - Samehadaku"
    const cleanTitle = pageTitle.replace(/\s*[-–]\s*Samehadaku.*$/i, '').trim();
    const epMatch = cleanTitle.match(/Episode\s+\d+(?:-\d+)?/i);
    let seriesTitle = cleanTitle.split(/Episode\s+\d+/i)[0].replace(/Subtitle\s+Indonesia/gi, '').trim();
    if (!seriesTitle) seriesTitle = cleanTitle;
    const episodeLabel = epMatch ? epMatch[0].trim() : 'Episode';

    const sources = [];
    const seenUrls = new Set();
    const pushSource = (rawUrl) => {
        if (!rawUrl) return;
        const url = rawUrl.trim().replace(/&amp;/g, '&');
        if (!/^https?:\/\//.test(url) || seenUrls.has(url)) return;
        seenUrls.add(url);
        sources.push({ reso: 'Blogger', url });
    };

    // Iframe default di #pembed.
    const defM = body.match(/id="pembed"[^>]*>\s*<iframe[^>]*src="([^"]+)"/i)
        || body.match(/<IFRAME\s+SRC="([^"]+)"/i);
    if (defM) pushSource(defM[1]);

    // Mirror options: value = base64 dari tag iframe utuh.
    const b64s = body.matchAll(/<option value="([A-Za-z0-9+/=]{30,})"/g);
    for (const m of b64s) {
        try {
            const dec = Buffer.from(m[1], 'base64').toString('utf8');
            const src = dec.match(/src=["']([^"']+)["']/i) || dec.match(/SRC=["']([^"']+)["']/i);
            if (src) pushSource(src[1]);
        } catch { /* abaikan decode error */ }
    }

    return {
        seriesTitle,
        episodeLabel,
        qualities: sources.length ? ['Blogger'] : [],
        sources
    };
}

/** Jadwal tidak tersedia di samehadaku — tampilkan ongoing sebagai satu grup. */
async function schedule() {
    const items = await listByType('ongoing');
    return [{ day: 'Rilisan Berjalan', items }];
}

module.exports = { BASE, getHtml, list, listByType, LIST_TYPES, search, genres, byGenre, detail, streams, schedule, parseCards, decodeEntities };
