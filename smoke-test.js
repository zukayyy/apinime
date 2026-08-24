/**
 * Smoke test: jalankan server lalu panggil endpoint utama.
 * Pemakaian: npm test  (server harus sudah berjalan di PORT)
 */
const BASE = process.env.BASE || 'http://localhost:3000';

const checks = [
    ['/anime/list?type=ongoing', r => Array.isArray(r.data) && r.data.length > 0],
    ['/anime/genres', r => Array.isArray(r.data) && r.data.length > 3],
    ['/anime/jadwal', r => Array.isArray(r.data)],
    ['/anime/detail?slug=black-clover', r => r.data.episodes && r.data.episodes.length > 0],
    ['/manga/browse?order=popular&page=1', r => Array.isArray(r.data) && r.data.length > 0],
    ['/manhua/browse?order=update&page=1', r => Array.isArray(r.data)],
    ['/manga/genres', r => Array.isArray(r.data) && r.data.length > 10]
];

(async () => {
    let failed = 0;
    for (const [path, validate] of checks) {
        try {
            const res = await fetch(BASE + path);
            const json = await res.json();
            const passed = res.ok && json.status === true && validate(json);
            console.log(`${passed ? 'PASS' : 'FAIL'}  ${path}${passed ? '' : ' -> ' + JSON.stringify(json).slice(0, 160)}`);
            if (!passed) failed++;
        } catch (e) {
            console.log(`FAIL  ${path} -> ${e.message}`);
            failed++;
        }
    }
    // Rantai detail -> streams komiku
    try {
        const d = await (await fetch(BASE + '/manga/browse?order=popular&page=1')).json();
        if (d.data?.length) {
            const slug = d.data[0].slug;
            const det = await (await fetch(`${BASE}/manga/detail?slug=${encodeURIComponent(slug)}`)).json();
            const ch = det.data?.chapters?.[0];
            if (ch) {
                const c = await (await fetch(`${BASE}/manga/chapter?url=${encodeURIComponent(ch.path.startsWith('http') ? ch.path : ch.path)}`)).json();
                const passed = c.status && Array.isArray(c.data.images) && c.data.images.length > 0;
                console.log(`${passed ? 'PASS' : 'FAIL'}  /manga/chapter (${c.data?.images?.length || 0} gambar)`);
                if (!passed) failed++;
            }
        }
    } catch (e) {
        console.log('FAIL  rantai komiku:', e.message);
        failed++;
    }

    // Rantai streams ylnime pakai episode pertama black-clover
    try {
        const s = await (await fetch(BASE + '/anime/streams?slug=black-clover&ep=' + encodeURIComponent('al-153308-1'))).json();
        const passed = s.status && Array.isArray(s.data.sources) && s.data.sources.length > 0;
        console.log(`${passed ? 'PASS' : 'FAIL'}  /anime/streams (${s.data?.sources?.length || 0} sumber)`);
        if (!passed) failed++;
    } catch (e) {
        console.log('FAIL  /anime/streams:', e.message);
        failed++;
    }

    console.log(failed === 0 ? '\nSemua test PASS ✅' : `\n${failed} test GAGAL ❌`);
    process.exit(failed === 0 ? 0 : 1);
})();
