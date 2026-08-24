/**
 * Core scraper ylnime.com untuk Zunime API.
 * Port dari implementasi Android (YlnimeRepository.kt).
 */
const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://ylnime.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Cookie disimpan lintas request agar sesi/Cloudflare ringan tetap lolos.
const cookieJar = new Map();

function cookieHeader() {
    return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function fetchResponse(url) {
    let lastErr = null;
    const candidates = [...new Set([url, url.replace('https://ylnime.com', 'https://www.ylnime.com')])];
    for (let attempt = 0; attempt < 3; attempt++) {
        for (const candidate of candidates) {
            try {
                const response = await axios.get(candidate, {
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
                // Simpan cookie dari Set-Cookie
                const setCookies = response.headers['set-cookie'] || [];
                for (const sc of setCookies) {
                    const [pair] = sc.split(';');
                    const idx = pair.indexOf('=');
                    if (idx > 0) cookieJar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
                }
                return response;
            } catch (e) {
                lastErr = e;
            }
        }
        if (attempt < 2) await sleep(800 * (attempt + 1));
    }
    throw lastErr || new Error(`Gagal memuat: ${url}`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getHtml(path) {
    const url = path.startsWith('http') ? path : `${BASE}/${path}`;
    const { data } = await fetchResponse(url);
    return data;
}

function decodeEntities(s) {
    if (!s) return '';
    return String(s)
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
        .replace(/&apos;/g, "'").replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function safeDecode(v) {
    try { return decodeURIComponent(v); } catch { return v; }
}

/** Semua kartu anime di dalam sebuah scope. */
function parseCards($, scope) {
    const root = scope || $.root();
    const seen = new Set();
    const out = [];
    root.find('a.stretched-link').each((_, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        const m = href.match(/[?&]series=([^&]+)/);
        if (!m) return;
        const slug = safeDecode(m[1]);
        const card = a.closest('.card');
        if (!card.length) return;
        const img = card.find('img').first();
        let title = (img.attr('alt') || '').trim();
        // Halaman search memakai alt="Cover" — judul asli ada di .card-title.
        if (!title || /^cover$/i.test(title)) {
            title = card.find('.card-title').first().text().trim();
        }
        if (!title) return;
        const src = img.attr('src') || '';
        const cover = src.startsWith('http') && !src.includes('placeholder') ? src : null;

        let rating = card.find('.badge-corner').first().text().replace(/[★]/g, '').trim() || null;
        if (!rating) {
            card.find('span').each((__, sp) => {
                if (rating) return;
                const html = $(sp).html() || '';
                if (html.includes('fa-star')) {
                    const t = $(sp).text().trim();
                    if (/^\d[.,]\d{1,2}$/.test(t)) rating = t.replace(',', '.');
                }
            });
        }
        let status = null;
        card.find('span').each((__, sp) => {
            if (status) return;
            const t = $(sp).text().trim();
            if (/^(completed|ongoing)$/i.test(t) || /tamat/i.test(t)) status = t;
        });

        if (!seen.has(slug)) {
            seen.add(slug);
            out.push({ slug, title: decodeEntities(title), cover, rating, status });
        }
    });
    return out;
}

async function list(pagePath) {
    const html = await getHtml(pagePath);
    const $ = cheerio.load(html);
    return parseCards($);
}

const LIST_TYPES = {
    home: 'index.php',
    ongoing: 'ongoing.php',
    completed: 'completed.php',
    movie: 'movies.php',
    baru: 'baru.php',
    rekomendasi: 'rekomendasi.php'
};

async function listByType(type) {
    const path = LIST_TYPES[type] || LIST_TYPES.ongoing;
    const items = await list(path);

    // Enrich items with no status by cross-referencing ongoing/completed lists.
    if (type === 'baru' || type === 'home' || type === 'rekomendasi') {
        const [ongoing, completed] = await Promise.all([
            list(LIST_TYPES.ongoing).catch(() => []),
            list(LIST_TYPES.completed).catch(() => [])
        ]);
        const statusMap = new Map();
        ongoing.forEach(it => { if (it.slug) statusMap.set(it.slug, 'Ongoing'); });
        completed.forEach(it => { if (it.slug) statusMap.set(it.slug, 'Tamat'); });
        items.forEach(it => {
            if (!it.status && statusMap.has(it.slug)) it.status = statusMap.get(it.slug);
        });
    }
    return items;
}

async function search(q) {
    if (!q || !q.trim()) return [];
    const html = await getHtml(`index.php?search=${encodeURIComponent(q.trim())}`);
    const $ = cheerio.load(html);
    return parseCards($);
}

async function genres() {
    const defaults = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Sci-Fi', 'Romance', 'School',
        'Shounen', 'Seinen', 'Slice of Life', 'Supernatural', 'Mystery', 'Psychological', 'Sports',
        'Music', 'Horror', 'Ecchi', 'Harem', 'Mecha', 'Military', 'Isekai'];
    try {
        const html = await getHtml('genre.php');
        const $ = cheerio.load(html);
        const found = [];
        $('a[href*="genre.php?g="]').each((_, el) => {
            const t = $(el).text().trim();
            if (t && !found.includes(t)) found.push(t);
        });
        return found.length ? found : defaults;
    } catch {
        return defaults;
    }
}

async function byGenre(genre, page = 1) {
    const g = encodeURIComponent(String(genre || '').toLowerCase().replace(/ /g, '-'));
    const html = await getHtml(`genre.php?g=${g}&page=${page}`);
    const $ = cheerio.load(html);
    return parseCards($);
}

function episodeNumber(label) {
    if (!label) return null;
    const kw = label.match(/(?:episode|eps?\.?)\s*([\d.]+)/i);
    if (kw) return parseFloat(kw[1]);
    const all = [...label.matchAll(/\d+(?:\.\d+)?/g)];
    return all.length ? parseFloat(all[all.length - 1][0]) : null;
}

async function detail(slug) {
    const html = await getHtml(`index.php?series=${encodeURIComponent(slug)}`);
    const $ = cheerio.load(html);

    let title = $('.breadcrumb .breadcrumb-item').last().text().trim();
    if (!title) title = ($('title').text() || '').replace(/^Nonton /, '').split(' Sub Indo')[0].trim();

    let cover = null;
    const covImg = $('img.img-fluid').first().attr('src');
    if (covImg && covImg.startsWith('http')) cover = covImg;

    // Blok genre: span yang teks langsungnya persis "Genres:"
    let genresDiv = null;
    $('span').each((_, el) => {
        if (genresDiv) return;
        const own = $(el).clone().children().remove().end().text().trim();
        if (own === 'Genres:') genresDiv = $(el).parent();
    });
    const genreScope = genresDiv.length ? genresDiv : $.root();
    const genres = [];
    genreScope.find('a[href*="?search="]').each((_, el) => {
        const g = $(el).text().trim().replace(/,+$/, '');
        if (g && g.length < 40 && !genres.includes(g)) genres.push(g);
    });

    let synopsis = null;
    if (genresDiv.length) {
        const prev = genresDiv.prev();
        if (prev.length && prev.get(0).tagName === 'p') synopsis = prev.text().trim();
    }
    if (!synopsis) {
        let best = '';
        $('p').each((_, el) => {
            const t = $(el).text().trim();
            if (t.length > best.length) best = t;
        });
        synopsis = best || null;
    }

    const statusValues = ['Sedang Tayang', 'Completed', 'Ongoing', 'Tamat', 'Movie', 'Serial', 'Berlangsung'];
    let status = null;
    // Cari badge status (bg-success / bg-warning) yang berisi ikon, bukan angka episode.
    $('span.badge').each((_, el) => {
        if (status) return;
        const t = $(el).text().trim().replace(/,+$/, '');
        if (t && !/^\d+$/.test(t) && statusValues.some(v => t.includes(v))) status = t;
    });

    let rating = null;
    const avg = $('.yl-avg-st').first().text() || '';
    const rm = avg.match(/(\d[.,]\d{1,2})/);
    if (rm) rating = rm[1].replace(',', '.');
    if (!rating) {
        $('span').each((_, el) => {
            if (rating) return;
            if ((($(el).html()) || '').includes('fa-star')) {
                const t = $(el).text().trim();
                if (/^\d[.,]\d{1,2}$/.test(t)) rating = t.replace(',', '.');
            }
        });
    }

    const epsMap = new Map();
    $('a[href*="episode="]').each((_, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        const m = href.match(/[?&]episode=([^&]+)/);
        if (!m) return;
        const id = safeDecode(m[1]);
        if (epsMap.has(id)) return;
        // Bersihkan newline/tanggal: ambil segmen teks pertama saja.
        const label = (a.text().replace(/\s+/g, ' ').trim().split(/\s\d{1,2} \w{3}, /)[0] || id).trim();
        epsMap.set(id, { id, label, number: episodeNumber(label) });
    });
    const episodes = [...epsMap.values()].sort((a, b) =>
        (a.number ?? Number.MAX_VALUE) - (b.number ?? Number.MAX_VALUE));

    return { slug, title, cover, synopsis, genres, status, rating, episodes };
}

async function streams(seriesSlug, episodeId) {
    const url = `${BASE}/index.php?series=${encodeURIComponent(seriesSlug)}&episode=${encodeURIComponent(episodeId)}`;
    const { data: body } = await fetchResponse(url);
    const $ = cheerio.load(body);

    const pageTitle = (body.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const stripped = pageTitle.replace(/^Nonton /, '');
    const seriesTitle = stripped.split(' Episode ')[0].split(' Sub Indo')[0].trim();
    const epMatch = stripped.match(/Episode [^|\-–]*/);
    const episodeLabel = epMatch ? epMatch[0].trim() : 'Episode';

    const qualities = [];
    $("a[href*='reso=']").each((_, el) => {
        const t = $(el).text().trim();
        if (/^\d+p$/.test(t) && !qualities.includes(t)) qualities.push(t);
    });

    const jm = body.match(/const streams = (\[.*?]);/s);
    const sources = [];
    if (jm) {
        try {
            const arr = JSON.parse(jm[1].replace(/\\\//g, '/'));
            for (const o of arr) {
                if (o.link && String(o.link).startsWith('http')) {
                    sources.push({ reso: o.reso || '?', url: o.link });
                }
            }
        } catch { /* abaikan parse error */ }
    }

    return {
        seriesTitle,
        episodeLabel,
        qualities: qualities.length ? qualities : [...new Set(sources.map(s => s.reso))],
        sources
    };
}

async function schedule() {
    const html = await getHtml('jadwals.php');
    const $ = cheerio.load(html);
    const days = [];
    $('[id^=day-]').each((_, section) => {
        const sec = $(section);
        const header = sec.find('.day-header').first();
        let dayName = header.find('span span').first().text().trim();
        if (!dayName) {
            dayName = (header.find('span').first().text() || '').split(/\s{2,}|\d/)[0].trim();
        }
        if (!dayName) return;
        days.push({ day: dayName, items: parseCards($, sec) });
    });
    if (!days.length) days.push({ day: 'Jadwal', items: parseCards($) });
    return days;
}

module.exports = { BASE, getHtml, list, listByType, LIST_TYPES, search, genres, byGenre, detail, streams, schedule, parseCards, decodeEntities };
