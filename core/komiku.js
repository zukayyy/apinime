/**
 * Core scraper komiku.org untuk Zunime API (manga / manhwa / manhua).
 * Port dari implementasi Android (KomikuRepository.kt).
 */
const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://komiku.org';
const API = 'https://api.komiku.org';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const cookieJar = new Map();

function cookieHeader() {
    return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getHtml(url) {
    let lastErr = null;
    const candidates = [...new Set([url, url.replace(API, BASE)])];
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
                const setCookies = response.headers['set-cookie'] || [];
                for (const sc of setCookies) {
                    const [pair] = sc.split(';');
                    const idx = pair.indexOf('=');
                    if (idx > 0) cookieJar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
                }
                return response.data;
            } catch (e) {
                lastErr = e;
            }
        }
        if (attempt < 2) await sleep(800 * (attempt + 1));
    }
    throw lastErr || new Error(`Gagal memuat: ${url}`);
}

/** Daftar genre umum Komiku (slug). */
const GENRES = [
    'action', 'adventure', 'comedy', 'drama', 'fantasy', 'isekai',
    'magic', 'martial-arts', 'mecha', 'mystery', 'psychological',
    'romance', 'school', 'sci-fi', 'seinen', 'shounen',
    'slice-of-life', 'sports', 'supernatural', 'thriller'
];

/** Kartu div.bge → MangaSummary. */
function parseBge($) {
    const seen = new Set();
    const out = [];
    $('div.bge').each((_, el) => {
        const block = $(el);
        const a = block.find("a[href*='/manga/']").first();
        const href = a.attr('href') || '';
        const m = href.match(/\/manga\/([^/?#]+)\//);
        if (!m) return;
        const slug = m[1];
        const title = block.find('h3').first().text().trim();
        if (!title || /^untitled$/i.test(title)) return;

        const img = block.find('img').first();
        let src = img.attr('src') || img.attr('data-src') || '';
        let cover = null;
        if (src.startsWith('http') && !src.includes('lazy')) cover = src.split('?')[0];

        out.push({
            slug,
            title,
            cover,
            type: block.find('.tpe1_inf b').first().text().trim() || null,
            info: block.find('.judul2').first().text().trim() || null,
            synopsis: block.find('p').first().text().trim() || null
        });
    });
    return out.filter(x => {
        if (seen.has(x.slug)) return false;
        seen.add(x.slug);
        return true;
    });
}

async function browse({ tipe = '', orderby = 'popular', page = 1, genre = '' }) {
    const gp = genre ? `&genre=${encodeURIComponent(genre)}` : '';
    const html = await getHtml(`${API}/manga/?tipe=${encodeURIComponent(tipe)}&orderby=${encodeURIComponent(orderby)}&page=${page}${gp}`);
    const $ = cheerio.load(html);
    return parseBge($);
}

async function search(q) {
    if (!q || !q.trim()) return [];
    const html = await getHtml(`${API}/manga/?s=${encodeURIComponent(q.trim())}&tipe=&orderby=&page=1`);
    const $ = cheerio.load(html);
    return parseBge($);
}

function normalizeUrl(href) {
    if (!href) return href;
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return BASE + href;
    return `${BASE}/${href}`;
}

function chapterNumber(url) {
    const m = String(url).match(/-chapter-([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
}

async function detail(slug) {
    const html = await getHtml(`${BASE}/manga/${encodeURIComponent(slug)}/`);
    const $ = cheerio.load(html);

    // Judul: span[itemprop=name] dalam link /manga/ (breadcrumb seri),
    // jangan yang pertama karena itu nama situs "Komiku".
    let title =
        $("a[href*='/manga/'] span[itemprop=name]").first().text().trim()
        || $('#Judul h1').first().text().trim()
        || $('[itemprop=name]').last().text().trim();
    let cover = $('[itemprop=image]').first().attr('content')
        || $('img[src*=thumbnail]').first().attr('src')
        || null;
    if (cover) cover = cover.split('?')[0];
    const synopsis = $('p.desc').first().text().trim() || null;
    const genres = [];
    $('meta[itemprop=genre]').each((_, el) => {
        const g = $(el).attr('content') || '';
        if (g.trim()) genres.push(g.trim());
    });

    const chapters = [];
    $('#Daftar_Chapter tr[itemprop=itemListElement]').each((_, row) => {
        const tr = $(row);
        const a = tr.find("a[href*='-chapter-']").first();
        if (!a.length) return;
        const path = a.attr('href') || '';
        const t = a.find('span').first().text().trim() || a.text().trim();
        const date = tr.find('.tanggalseries').first().text().trim() || null;
        chapters.push({ path, title: t, date });
    });

    return { slug, title, cover, type: null, synopsis, genres, chapters };
}

async function chapter(pathOrUrl) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
    const html = await getHtml(url);
    const $ = cheerio.load(html);

    let title = $('meta[itemprop=name]').first().attr('content')
        || $('.topmenu span').first().text().trim()
        || '';

    const container = $('#Baca_Komik').length ? $('#Baca_Komik') : $.root();
    const images = [];
    container.find('img').each((_, el) => {
        let src = $(el).attr('src') || '';
        try {
            src = new URL(src, url).toString();
        } catch { return; }
        if (
            src.includes('komiku') &&
            src.includes('/upload') &&
            !src.includes('promosi') &&
            !src.includes('lazy') &&
            !src.includes('/asset/') &&
            !images.includes(src)
        ) images.push(src);
    });

    let cover = $('meta[itemprop=image]').first().attr('content') || null;

    const currentNum = chapterNumber(url);
    let prev = null, next = null;
    if (currentNum !== null) {
        $("a[href*='-chapter-']").each((_, el) => {
            const candidate = normalizeUrl($(el).attr('href'));
            if (candidate === url) return;
            const n = chapterNumber(candidate);
            if (n === null) return;
            if (n < currentNum && (prev === null || n > (chapterNumber(prev) ?? -Infinity))) prev = candidate;
            if (n > currentNum && (next === null || n < (chapterNumber(next) ?? Infinity))) next = candidate;
        });
    }

    return { url, title, cover, images, prev, next };
}

module.exports = { BASE, API, GENRES, browse, search, detail, chapter };
