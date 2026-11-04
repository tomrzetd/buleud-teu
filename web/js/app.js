/* Buleud Teu — aplikasi web (PWA). Bergantung pada: ljk-spec.js, ljk-template.js, ljk-engine.js, ljk-ident.js */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const store = {
        get(k, d) { try { const v = localStorage.getItem('bt_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem('bt_' + k, JSON.stringify(v)); } catch (e) { } },
        del(k) { try { localStorage.removeItem('bt_' + k); } catch (e) { } }
    };
    const SPEC = LJKSpec.SPEC;
    const WATERMARK = 'by : rizalabdurrahman05@guru.smp.belajar.id';
    const S = {
        api: store.get('api', ''), token: store.get('token', ''), guru: store.get('guru', null), config: store.get('config', null),
        data: store.get('exams', null), exam: null, scanMode: 'exam', editing: null, lastImage: null, res: null, answers: [], status: [], suggest: [],
        ident: null, params: store.get('params', { sens: 50, con: 10 }), ocr: store.get('ocr', true), auto: store.get('auto', true),
        layers: store.get('layers', { view: 'rect', kisi: true, dark: false, conf: true, circ: false }), queue: store.get('queue', []),
        stream: null, loop: null, stable: 0, lastCorners: null, busy: false, pin: '', keyDraft: '', procMs: 0
    };

    // ------------------------------------------------------------ UI dasar
    function go(name) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 'scr-' + name)); }
    let toastT;
    function toast(msg, ms = 3200) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
    function busy(on, tx) { $('busy').classList.toggle('on', !!on); if (tx) $('busyTx').textContent = tx; }
    function log(m) { const l = $('log'); if (l) { l.textContent += m + '\n'; l.scrollTop = l.scrollHeight; } }

    // ------------------------------------------------------------ API
    async function apiGet(action) {
        const r = await fetch(S.api + '?action=' + encodeURIComponent(action), { redirect: 'follow' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const t = await r.text(); let j;
        try { j = JSON.parse(t); } catch (e) { throw new Error('Server membalas halaman, bukan data. Pastikan deploy Web App dengan akses "Siapa saja".'); }
        if (j.error) throw new Error(j.error);
        return j;
    }
    async function apiPost(obj) {
        const body = JSON.stringify(Object.assign({ token: S.token }, obj));
        const r = await fetch(S.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
        const j = await r.json();
        if (j.auth) { S.token = ''; store.del('token'); go('login'); renderLogin(); throw new Error(j.error); }
        if (j.error) throw new Error(j.error);
        return j;
    }

    // ------------------------------------------------------------ setup & login
    async function saveApi() {
        const v = $('inApi').value.trim();
        if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(v)) { $('setupDiag').innerHTML = '<span style="color:#fca5a5">URL harus https://script.google.com/macros/s/…/exec (URL Web App, bukan URL editor).</span>'; return; }
        S.api = v; $('setupDiag').textContent = 'Menghubungi…'; busy(true, 'Menghubungi server sekolah…');
        try {
            const c = await apiGet('config');
            if (c.version !== 'V40') throw new Error('Apps Script masih versi lama (' + (c.version || '?') + '). Pasang kode Apps Script Buleud Teu V40.');
            store.set('api', v); S.config = c; store.set('config', c);
            go('login'); renderLogin();
        } catch (e) {
            $('setupDiag').innerHTML = '<span style="color:#fca5a5">' + esc(e.message === 'Failed to fetch' ? 'Tidak bisa dihubungi. Cek internet, dan pastikan akses Web App = "Siapa saja (Anyone)".' : e.message) + '</span>';
        } finally { busy(false); }
    }
    function brand(prefix) {
        const sk = (S.config && S.config.sekolah) || {}, img = $(prefix + 'Logo');
        if (sk.logo) { img.src = sk.logo; img.style.display = 'block'; } else img.style.display = 'none';
        return sk;
    }
    function renderLogin() {
        const sk = brand('login');
        $('loginSchool').innerHTML = esc(sk.nama || 'Sekolah') + '<span class="sub">Masuk guru</span>';
        $('selGuru').innerHTML = ((S.config && S.config.guru) || []).map(g => `<option>${esc(g.nama)}</option>`).join('');
        if (S.guru) $('selGuru').value = S.guru.nama;
        S.pin = ''; drawPin();
        $('pinPad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map(k => `<button class="btn" data-k="${k}">${k}</button>`).join('');
        $('pinPad').onclick = (e) => { const k = e.target.dataset && e.target.dataset.k; if (!k) return; if (k === '⌫') S.pin = S.pin.slice(0, -1); else if (k === '✓') return doLogin(); else if (S.pin.length < 4) S.pin += k; drawPin(); if (S.pin.length === 4) doLogin(); };
        // segarkan konfigurasi di latar
        apiGet('config').then(c => { S.config = c; store.set('config', c); const cur = $('selGuru').value; $('selGuru').innerHTML = c.guru.map(g => `<option>${esc(g.nama)}</option>`).join(''); if (cur) $('selGuru').value = cur; brand('login'); }).catch(() => { });
    }
    function drawPin() { [...$('pinDots').children].forEach((d, i) => d.classList.toggle('f', i < S.pin.length)); }
    async function doLogin() {
        if (S.pin.length !== 4) return;
        $('loginMsg').textContent = 'Memeriksa…'; busy(true, 'Masuk…');
        try {
            const r = await apiPost({ action: 'login', guru: $('selGuru').value, pin: S.pin });
            S.token = r.token; S.guru = r.guru; store.set('token', r.token); store.set('guru', r.guru);
            $('loginMsg').textContent = ''; go('home'); loadExams(true);
        } catch (e) { $('loginMsg').innerHTML = '<span style="color:#fca5a5">' + esc(e.message) + '</span>'; S.pin = ''; drawPin(); } finally { busy(false); }
    }
    function logout() { S.token = ''; store.del('token'); store.del('exams'); S.data = null; go('login'); renderLogin(); }

    // ------------------------------------------------------------ beranda
    async function loadExams(fresh) {
        const sk = brand('home');
        $('homeSub').textContent = (S.guru ? S.guru.nama : '') + (sk.nama ? ' · ' + sk.nama : '');
        renderHome();
        if (!fresh && S.data) return;
        homeLoading('Memuat data ujian & siswa dari spreadsheet…');
        try { S.data = await apiPost({ action: 'exams' }); store.set('exams', S.data); renderHome(); flushQueue(); }
        catch (e) { if (!S.data) $('examList').innerHTML = `<div class="note n-bad">${esc(e.message)}</div>`; else toast('Offline: memakai data terakhir'); }
        finally { homeLoading(null); }
        apiGet('config').then(c => { S.config = c; store.set('config', c); brand('home'); renderFooter(); }).catch(() => { });
    }
    function homeLoading(msg) { const el = $('homeLoad'); el.style.display = msg ? '' : 'none'; if (msg) $('homeLoadTx').textContent = msg; }
    function renderFooter() {
        const sk = (S.config && S.config.sekolah) || {};
        $('schoolFoot').innerHTML = (sk.logo ? `<img src="${esc(sk.logo)}" alt="logo" class="flogo">` : '') +
            (sk.nama ? `<div class="fname">${esc(sk.nama)}</div>` : '') + (sk.tahun ? `<div class="muted small">Tahun Pelajaran ${esc(sk.tahun)}</div>` : '') +
            `<div class="muted small" style="margin-top:10px;opacity:.75">Buleud Teu • "Mun buleud, ku urang dipariksa!"</div><div class="muted small">${WATERMARK}</div>`;
    }
    function examStudents(u) {
        const all = (S.data && S.data.siswa) || [];
        if (!u) return all;
        if (!u.kelas.length || u.kelas.indexOf('SEMUA') >= 0) return all.filter(s => !u.tingkat || String(s.tingkat) === String(u.tingkat));
        return all.filter(s => u.kelas.indexOf(s.kelas) >= 0);
    }
    function renderHome() {
        renderFooter();
        const q = S.queue.length;
        $('queueNote').innerHTML = q ? `<div class="note n-warn">${q} hasil scan menunggu dikirim (offline). <button class="btn sm" onclick="App.flushQueue(true)">Kirim sekarang</button></div>` : '';
        const list = (S.data && S.data.ujian) || [];
        if (!list.length) { $('examList').innerHTML = '<div class="card muted">Belum ada ujian aktif. Buat ujian baru, isi kunci, lalu cetak LJK.</div>'; return; }
        $('examList').innerHTML = list.map((u, i) => {
            const tot = examStudents(u).length, done = (u.terscan || []).length, pct = tot ? Math.min(100, Math.round(done / tot * 100)) : 0;
            return `<div class="card exam"><div class="row" style="align-items:flex-start"><div style="flex:1"><div class="t">${esc(u.nama)}</div>
                <div class="m">${esc(u.mapel)} · ${esc(u.kelas.join(', ') || 'Tingkat ' + u.tingkat)} · ${u.jumlah} soal · ${u.opsi} · KKTP ${u.kktp}</div></div>
                <span class="badge b-info">${done}/${tot}</span></div><div class="bar"><i style="width:${pct}%"></i></div>
                <div class="row"><button class="btn pri sm" onclick="App.startScan(${i},'exam')">📷 Scan</button><button class="btn sm" onclick="App.editExam(${i})">Edit</button>
                <button class="btn sm" onclick="App.openPrint(${i})">Cetak LJK</button><button class="btn sm" onclick="App.openAnalysis(${i})">Analisis</button></div></div>`;
        }).join('');
    }

    // ------------------------------------------------------------ edit ujian & kunci
    function editExam(i) {
        const u = i == null ? null : S.data.ujian[i];
        S.editing = u ? Object.assign({}, u) : { id: '', nama: '', mapel: (S.guru.mapel || [])[0] || '', kelas: [], opsi: (S.data && S.data.opsiDefault) || 'ABCD', kunci: '', kktp: 75 };
        $('examTitle').textContent = u ? 'Edit ujian' : 'Ujian baru';
        $('exNama').value = S.editing.nama; $('exMapel').value = S.editing.mapel; $('exKktp').value = S.editing.kktp;
        $('dlMapel').innerHTML = (S.guru.mapel || []).map(m => `<option>${esc(m)}</option>`).join('');
        const kelasAll = [...new Set([...(S.guru.kelas || []), ...((S.data && S.data.kelasSemua) || [])])];
        $('exKelas').innerHTML = kelasAll.map(k => `<span class="chip ${S.editing.kelas.indexOf(k) >= 0 ? 'on' : ''}" data-k="${esc(k)}">${esc(k)}</span>`).join('') || '<span class="muted small">Belum ada data siswa/kelas di sheet Siswa.</span>';
        $('exKelas').onclick = (e) => { const k = e.target.dataset && e.target.dataset.k; if (!k) return; const a = S.editing.kelas, ix = a.indexOf(k); if (ix >= 0) a.splice(ix, 1); else a.push(k); e.target.classList.toggle('on'); };
        $('btnArchive').style.display = u ? '' : 'none';
        $('examMsg').innerHTML = '';
        $('exKunci').value = S.editing.kunci; setOpsi(S.editing.opsi); go('exam');
    }
    function setOpsi(o) {
        S.editing.opsi = o;
        document.querySelectorAll('[data-opsi]').forEach(c => c.classList.toggle('on', c.dataset.opsi === o));
        keyTyped();
    }
    function keyTyped() {
        const raw = $('exKunci').value.toUpperCase().replace(/[^A-E?-]/g, '').slice(0, 50);
        if (raw !== $('exKunci').value) $('exKunci').value = raw;
        S.editing.kunci = raw; $('keyCount').textContent = raw.length + ' soal';
        renderLjk($('keyGrid'), { n: 50, opsi: S.editing.opsi, answers: [...raw].map(c => /[A-E]/.test(c) ? c : null), keyMode: true, onTap: (q, L) => {
            const arr = [...S.editing.kunci.padEnd(Math.max(S.editing.kunci.length, q + 1), '-')];
            arr[q] = arr[q] === L ? '-' : L;
            $('exKunci').value = arr.join('').replace(/-+$/, ''); keyTyped();
        } });
    }
    function keyClear() { $('exKunci').value = ''; keyTyped(); }
    async function saveExam() {
        const e = S.editing;
        e.nama = $('exNama').value.trim(); e.mapel = $('exMapel').value.trim().toUpperCase(); e.kktp = Number($('exKktp').value) || 75;
        const k = e.kunci;
        const msg = (t, c = 'n-bad') => $('examMsg').innerHTML = `<div class="note ${c}">${esc(t)}</div>`;
        if (!e.nama || !e.mapel) return msg('Nama ujian dan mapel wajib diisi.');
        if (!e.kelas.length) return msg('Pilih minimal satu kelas.');
        if (!k.length) return msg('Kunci jawaban masih kosong.');
        if (/[-?]/.test(k)) return msg('Ada nomor kunci yang kosong di tengah (tanda -). Lengkapi atau hapus.');
        if (e.opsi === 'ABCD' && /E/.test(k)) return msg('Kunci berisi E, padahal opsi ABCD.');
        busy(true, 'Menyimpan ujian…');
        try { await apiPost({ action: 'saveExam', exam: e }); toast('Ujian tersimpan (' + k.length + ' soal)'); go('home'); await loadExams(true); }
        catch (err) { msg(err.message); } finally { busy(false); }
    }
    async function archiveExam() {
        if (!S.editing || !S.editing.id) return;
        busy(true, 'Mengarsipkan…');
        try { await apiPost({ action: 'archiveExam', id: S.editing.id }); go('home'); await loadExams(true); } catch (e) { toast(e.message); } finally { busy(false); }
    }

    // ------------------------------------------------------------ LJK digital
    function renderLjk(el, o) {
        const n = o.n, L = o.opsi, rows = o.rows || 10, letters = L.split('');
        let h = '';
        for (let b = 0; b * rows < (o.total || 50); b++) {
            h += '<div class="blk">';
            for (let r = 0; r < rows; r++) {
                const q = b * rows + r; if (q >= (o.total || 50)) break;
                const off = q >= n, st = o.status ? o.status[q] : 'ok', a = o.answers[q], key = o.key ? o.key[q] : null;
                const flag = !off && (st === 'double' || st === 'weak');
                h += `<div class="q ${off ? 'off' : ''} ${flag ? 'flag' : ''}"><span class="no">${q + 1}</span>`;
                letters.forEach(Lt => {
                    let c = 'bub';
                    if (!off) {
                        if (a === Lt) c += ' sel' + (o.keyMode ? '' : (key ? (key === Lt ? ' right' : ' wrong') : ''));
                        else if (flag && (o.suggest[q] || '').indexOf(Lt) >= 0) c += ' cand';
                        if (key === Lt && a !== Lt) c += ' key';
                    }
                    h += `<span class="${c}" data-q="${q}" data-l="${Lt}">${Lt}</span>`;
                });
                h += '</div>';
            }
            h += '</div>';
        }
        el.innerHTML = h;
        el.onclick = (e) => { const t = e.target; if (t.dataset && t.dataset.q != null && o.onTap) o.onTap(Number(t.dataset.q), t.dataset.l); };
    }

    // ------------------------------------------------------------ kamera
    async function startScan(i, mode) {
        S.scanMode = mode;
        S.exam = mode === 'exam' ? S.data.ujian[i] : null;
        const title = mode === 'key' ? 'Scan LJK kunci' : mode === 'markerless' ? 'LJK lama (tanpa marker)' : S.exam.nama;
        const sub = mode === 'key' ? `Varian ${S.editing.opsi}` : mode === 'markerless' ? '20 soal · 4 kolom × 5 baris' : `${S.exam.mapel} · ${S.exam.jumlah} soal · ${S.exam.opsi}`;
        $('scanTitle').innerHTML = esc(title) + `<span class="sub">${esc(sub)}</span>`;
        $('scanHint').textContent = mode === 'markerless' ? 'Masukkan seluruh tabel pilihan ganda ke layar, lalu tekan tombol' : 'Arahkan ke seluruh LJK — 4 kotak hitam di sudut harus terlihat';
        $('chkAuto').checked = S.auto;
        go('scan');
        try {
            if (!S.stream) S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false });
            $('video').srcObject = S.stream; await $('video').play().catch(() => { });
        } catch (e) { $('scanHint').textContent = 'Kamera tidak tersedia — pakai tombol galeri 🖼'; }
        startLoop();
    }
    function stopCamera() { clearTimeout(S.loop); S.loop = null; if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; } }
    function stopScan() { stopCamera(); go(S.scanMode === 'key' ? 'exam' : 'home'); }
    function setAuto(v) { S.auto = v; store.set('auto', v); }
    const small = document.createElement('canvas');
    function startLoop() {
        clearTimeout(S.loop); S.stable = 0; S.lastCorners = null;
        const tick = () => {
            S.loop = setTimeout(tick, 260);
            if (S.busy || !$('scr-scan').classList.contains('on')) return;
            const v = $('video'); if (!v.videoWidth) return;
            const sc = 720 / Math.max(v.videoWidth, v.videoHeight);
            small.width = Math.round(v.videoWidth * sc); small.height = Math.round(v.videoHeight * sc);
            const cx = small.getContext('2d', { willReadFrequently: true }); cx.drawImage(v, 0, 0, small.width, small.height);
            const id = cx.getImageData(0, 0, small.width, small.height);
            let det = S.scanMode === 'markerless' ? null : LJKEngine.detectMarkersFast(id, { maxSide: 720 });
            if (!det && legacyAllowed()) det = detectLegacy(id);
            drawOverlay(det, sc);
        };
        tick();
    }
    // LJK lama boleh dideteksi: mode cek cepat, atau ujian <= 20 soal ABCD
    function legacyAllowed() { return S.scanMode === 'markerless' || (S.scanMode === 'exam' && S.exam && S.exam.jumlah <= 20 && S.exam.opsi === 'ABCD'); }
    // kisi LJK lama di frame preview kecil: semua bulatan + mana yang terisi
    function detectLegacy(id) {
        const w = id.width, h = id.height, cyc = [0, 90, 270];
        // hemat CPU: arah terakhir yang berhasil dulu, lalu SATU arah lain bergiliran per frame
        S.legTry = ((S.legTry || 0) + 1) % 3;
        const order = [S.legDeg || 0, cyc[S.legTry]].filter((d, i, a) => a.indexOf(d) === i);
        for (const deg of order) {        // LJK boleh tegak atau menyamping
            const r = LJKEngine.processMarkerless(LJKEngine.rotateImg(id, deg), { maxSide: 720, layout: { questions: 20, blocks: 4, options: 4 } });
            if (!r.success) continue;
            S.legDeg = deg;
            const back = (p) => deg === 90 ? { x: p.y, y: h - 1 - p.x } : deg === 270 ? { x: w - 1 - p.y, y: p.x } : { x: p.x, y: p.y };
            const g = r.geo, pad = g.R0 * 2.2, u0 = g.colU[0] - pad, u1 = g.colU[g.colU.length - 1] + pad, v0 = g.rowV[0] - pad, v1 = g.rowV[g.rowV.length - 1] + pad;
            const pts = []; r.debug.grid.forEach(row => row.forEach(p => { const q = back(p); pts.push({ x: q.x, y: q.y, f: p.d >= r.thr }); }));
            return { legacy: true, corners: [g.map(u0, v0), g.map(u1, v0), g.map(u1, v1), g.map(u0, v1)].map(back), bubbles: pts, r: g.R0, pxPerMm: g.R0 >= 4.5 ? 99 : 0 };
        }
        return null;
    }
    function drawOverlay(det, sc) {
        const v = $('video'), ov = $('overlay'), W = ov.clientWidth, H = ov.clientHeight;
        ov.width = W; ov.height = H; const ctx = ov.getContext('2d'); ctx.clearRect(0, 0, W, H);
        const sh = $('shutter');
        if (!det) { S.stable = 0; S.lastCorners = null; sh.classList.remove('ready'); $('scanHint').textContent = S.scanMode === 'markerless' ? 'Masukkan seluruh tabel pilihan ganda ke layar…' : 'Cari LJK… (F4: 4 kotak hitam di sudut)'; return; }
        // video object-fit: cover -> koordinat layar
        const s = Math.max(W / v.videoWidth, H / v.videoHeight), ox = (W - v.videoWidth * s) / 2, oy = (H - v.videoHeight * s) / 2;
        const pts = det.corners.map(p => ({ x: p.x / sc * s + ox, y: p.y / sc * s + oy }));
        // stabilitas
        const diag = Math.hypot(W, H);
        const moved = S.lastCorners ? pts.reduce((a, p, i) => a + Math.hypot(p.x - S.lastCorners[i].x, p.y - S.lastCorners[i].y), 0) / 4 : 1e9;
        S.lastCorners = pts;
        const fullPxMm = det.pxPerMm / sc;   // skala pada resolusi penuh
        const okRes = fullPxMm >= 2.3;
        if (moved < diag * 0.012 && okRes) S.stable++; else S.stable = 0;
        const ready = S.stable >= 3;
        ctx.lineWidth = 4; ctx.strokeStyle = ready ? '#22c55e' : okRes ? '#facc15' : '#f97316'; ctx.fillStyle = ready ? '#22c55e33' : '#facc1522';
        ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (!det.legacy) pts.forEach(p => { ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(p.x - 7, p.y - 7, 14, 14); });
        else {   // setiap bulatan jawaban: terisi = menyala hijau, kosong = cincin tipis
            const rr = Math.max(4, det.r / sc * s);
            det.bubbles.forEach(b => {
                const x = b.x / sc * s + ox, y = b.y / sc * s + oy;
                if (b.f) {
                    ctx.fillStyle = '#22c55e40'; ctx.beginPath(); ctx.arc(x, y, rr * 2, 0, 6.3); ctx.fill();
                    ctx.fillStyle = '#22c55e90'; ctx.beginPath(); ctx.arc(x, y, rr * 1.35, 0, 6.3); ctx.fill();
                    ctx.strokeStyle = '#86efac'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, rr * 1.1, 0, 6.3); ctx.stroke();
                } else { ctx.strokeStyle = '#ffffff8c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, rr * 1.1, 0, 6.3); ctx.stroke(); }
            });
        }
        sh.classList.toggle('ready', ready);
        $('scanHint').textContent = !okRes ? 'Dekatkan kamera sedikit' : ready ? 'Tahan… mengambil foto' : det.legacy ? `LJK lama terdeteksi · ${det.bubbles.filter(b => b.f).length} bulatan terisi — tahan HP diam` : 'LJK F4 terdeteksi — tahan HP diam';
        if (ready && S.auto) { S.stable = 0; capture(); }
    }
    function capture() {
        const v = $('video');
        if (!v.videoWidth) return toast('Kamera belum siap');
        const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0);
        if (navigator.vibrate) navigator.vibrate(40);
        processImage(c.getContext('2d').getImageData(0, 0, c.width, c.height));
    }
    function fromFile(input) {
        const f = input.files && input.files[0]; if (!f) return;
        const img = new Image();
        img.onload = () => {
            const s = Math.min(1, 3000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
            c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(img.src); processImage(c.getContext('2d').getImageData(0, 0, c.width, c.height));
        };
        img.onerror = () => toast('File gambar tidak bisa dibaca');
        img.src = URL.createObjectURL(f); input.value = '';
    }

    // ------------------------------------------------------------ proses
    function runEngine(img) {
        const p = { sensitivity: S.params.sens, contrast: S.params.con };
        if (S.scanMode === 'markerless') return LJKEngine.processMarkerlessAuto(img, Object.assign(p, { layout: { questions: 20, blocks: 4, options: 4 } }));
        const opsi = S.scanMode === 'key' ? S.editing.opsi : S.exam.opsi;
        const r = LJKEngine.processMarker(img, Object.assign({}, p, { options: opsi.length, active: S.scanMode === 'key' ? 50 : S.exam.jumlah }));
        // LJK lama (tanpa marker, 4 kolom x 5 baris) dikenali otomatis untuk ujian <= 20 soal ABCD
        if (!r.success && S.scanMode === 'exam' && S.exam.jumlah <= 20 && S.exam.opsi === 'ABCD') {
            const l = LJKEngine.processMarkerlessAuto(img, Object.assign({}, p, { layout: { questions: 20, blocks: 4, options: 4 } }));
            if (l.success) { l.warnings.push('LJK lama (tanpa marker) terdeteksi — dinilai dengan kunci ujian ini.'); return l; }
        }
        return r;
    }
    function processImage(img) {
        if (S.busy) return; S.busy = true; busy(true, 'Memproses LJK…');
        setTimeout(() => {
            try {
                const t0 = performance.now();
                S.lastImage = img;
                const r = runEngine(img);
                S.procMs = Math.round(performance.now() - t0);
                if (!r.success) { toast(r.error, 4500); S.busy = false; busy(false); return; }
                if (r.image) S.lastImage = r.image;
                if (S.scanMode === 'key') { keyFromScan(r); return; }
                S.res = r; S.answers = r.answers.slice(); S.status = r.status.slice(); S.suggest = r.suggest.slice(); S.confirm = false; S.scanId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                showResult();
                S.busy = false;
            } catch (e) { console.error(e); toast('Error: ' + e.message); S.busy = false; }
            finally { busy(false); }
        }, 50);
    }
    function reprocess() { if (!S.lastImage) return; const r = runEngine(S.lastImage); if (!r.success) return toast(r.error); if (r.image) S.lastImage = r.image; S.res = r; S.answers = r.answers.slice(); S.status = r.status.slice(); S.suggest = r.suggest.slice(); showResult(true); }
    function keyFromScan(r) {
        S.busy = false; stopCamera();
        let last = -1; r.answers.forEach((a, i) => { if (a) last = i; });
        const k = r.answers.slice(0, last + 1).map(a => a || '-').join('');
        const flags = r.status.slice(0, last + 1).map((s, i) => s === 'double' || s === 'weak' ? i + 1 : 0).filter(Boolean);
        $('exKunci').value = k; go('exam'); keyTyped();
        $('examMsg').innerHTML = `<div class="note ${flags.length || /-/.test(k) ? 'n-warn' : 'n-ok'}">Kunci dari scan: ${k.length} soal.${flags.length ? ' Periksa nomor ' + flags.join(', ') + '.' : ''}${/-/.test(k) ? ' Ada nomor kosong (-).' : ''}</div>`;
    }

    // ------------------------------------------------------------ hasil
    function keyArr() { return S.exam ? [...S.exam.kunci] : null; }
    function score() {
        if (!S.exam) return null;
        let b = 0; for (let i = 0; i < S.exam.jumlah; i++) if (S.answers[i] && S.answers[i] === S.exam.kunci[i]) b++;
        return { benar: b, skor: Math.round(b / S.exam.jumlah * 10000) / 100 };
    }
    function showResult(keepIdent) {
        stopLoopOnly();
        const r = S.res, u = S.exam;
        go('result');
        $('resTitle').innerHTML = esc(u ? u.nama : 'LJK lama') + `<span class="sub">${esc(u ? u.mapel + ' · ' + u.jumlah + ' soal' : '20 soal · tanpa marker')}</span>`;
        renderAnswers();
        const q = r.quality || {};
        const g = q.grade || '-';
        $('resBadges').innerHTML = `<span class="badge ${g === 'A' ? 'b-ok' : g === 'B' ? 'b-warn' : 'b-bad'}">Kualitas foto ${g}${q.score != null ? ' · ' + q.score : ''}</span> ` +
            `<span class="badge b-info">${r.mode === 'marker' ? 'Mode marker F4' : 'Mode tanpa marker'}</span> <span class="badge b-info">${S.procMs} ms</span>`;
        $('resNotes').innerHTML = (r.warnings || []).map(w => `<div class="note n-warn">${esc(w)}</div>`).join('') + (g === 'C' ? '<div class="note n-warn">Kualitas foto rendah. Sebaiknya foto ulang lebih dekat, terang, dan tidak buram.</div>' : '');
        renderLayersChips(); drawEvidence(); renderQuality();
        $('log').textContent = ''; (r.logs || []).forEach(log);
        $('idCard').style.display = u ? '' : 'none';
        if (u && !keepIdent) setupIdentity();
    }
    function stopLoopOnly() { clearTimeout(S.loop); S.loop = null; }
    function renderAnswers() {
        const u = S.exam, n = u ? u.jumlah : 20;
        const sc = score();
        if (sc) {
            $('resScore').textContent = sc.skor % 1 ? sc.skor.toFixed(1) : sc.skor;
            $('resBenar').textContent = `${sc.benar} benar dari ${n} soal`;
            const ring = $('resRing'); ring.style.strokeDashoffset = 264 - 264 * sc.skor / 100; ring.style.stroke = sc.skor < (u.kktp || 75) ? '#ef4444' : '#22c55e';
        } else { $('resScore').textContent = S.answers.filter(Boolean).length; $('resBenar').textContent = 'jawaban terbaca (tanpa kunci)'; }
        const lama = S.res && S.res.mode === 'markerless';
        renderLjk($('ljkGrid'), { n, total: lama ? 20 : 50, rows: lama ? 5 : 10, opsi: u ? u.opsi : 'ABCD', answers: S.answers, status: S.status, suggest: S.suggest, key: keyArr(), onTap: (q, L) => {
            S.answers[q] = S.answers[q] === L ? null : L; S.status[q] = S.answers[q] ? 'ok' : 'blank'; S.confirm = false; renderAnswers(); drawEvidence();
        } });
        if (u) { const fl = flagged(); $('saveNote').innerHTML = fl.length ? `<div class="note n-warn">Perlu dicek: nomor ${fl.join(', ')} (kuning).</div>` : ''; }
    }
    function flagged() { const out = []; S.status.forEach((s, i) => { if ((s === 'double' || s === 'weak') && (!S.exam || i < S.exam.jumlah)) out.push(i + 1); }); return out; }

    // ---- lapisan bukti deteksi
    const LAYERS = [['view', 'Diluruskan / Foto asli'], ['kisi', 'Kisi'], ['dark', 'Kehitaman %'], ['conf', 'Keyakinan'], ['circ', 'Lingkaran terdeteksi']];
    function renderLayersChips() {
        $('layerChips').innerHTML = LAYERS.map(([k, t]) => {
            const on = k === 'view' ? true : S.layers[k];
            const label = k === 'view' ? (S.layers.view === 'rect' ? '▣ Diluruskan' : '📷 Foto asli') : t;
            return `<span class="chip ${on ? 'on' : ''}" data-ly="${k}">${label}</span>`;
        }).join('');
        $('layerChips').onclick = (e) => { const k = e.target.dataset && e.target.dataset.ly; if (!k) return; if (k === 'view') S.layers.view = S.layers.view === 'rect' ? 'foto' : 'rect'; else S.layers[k] = !S.layers[k]; store.set('layers', S.layers); renderLayersChips(); drawEvidence(); };
    }
    function putGray(cv, w, h, data) {
        cv.width = w; cv.height = h; const ctx = cv.getContext('2d'), id = ctx.createImageData(w, h);
        for (let i = 0, p = 0; i < w * h; i++, p += 4) { id.data[p] = id.data[p + 1] = id.data[p + 2] = data[i]; id.data[p + 3] = 255; }
        ctx.putImageData(id, 0, 0); return ctx;
    }
    function bubbleColor(q, L) {
        const st = S.status[q], a = S.answers[q], key = S.exam ? S.exam.kunci[q] : null;
        if ((st === 'double' || st === 'weak') && (S.suggest[q] || '').indexOf(L) >= 0) return '#f59e0b';
        if (a === L) return key ? (key === L ? '#16a34a' : '#dc2626') : '#16a34a';
        return null;
    }
    function drawEvidence() {
        const r = S.res, cv = $('evCanvas'); if (!r || !r.debug) return;
        const dbg = r.debug, ly = S.layers;
        const n = S.exam ? S.exam.jumlah : 20, LET = (S.exam ? S.exam.opsi : 'ABCD').split('');
        let ctx, toOut, R, ptsOf;
        if (r.mode === 'marker') {
            const P = SPEC.pg, geo = r.geo, mapper = LJKEngine.mmMapper(geo);
            if (ly.view === 'rect') {
                const rc = LJKEngine.rectifyMM(S.lastImage, geo, SPEC.regions.view, 1000);
                ctx = putGray(cv, rc.w, rc.h, rc.data); toOut = (u, v) => rc.toOut(u, v); R = P.r * rc.k;
            } else {
                const f = Math.min(1, 1000 / dbg.W);
                const g = f < 1 ? downs(dbg.g, dbg.W, dbg.H, f) : { w: dbg.W, h: dbg.H, d: dbg.g };
                ctx = putGray(cv, g.w, g.h, g.d);
                toOut = (u, v) => { const p = mapper(u, v); return { x: p.x * f, y: p.y * f }; }; R = P.r * geo.pxPerMm * f;
                // tepi halaman + marker
                ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.beginPath();
                [[0, 0], [SPEC.page.w, 0], [SPEC.page.w, SPEC.page.h], [0, SPEC.page.h]].forEach((c, i) => { const p = geo.H.fwd(c[0], c[1]); i ? ctx.lineTo(p.x * f, p.y * f) : ctx.moveTo(p.x * f, p.y * f); }); ctx.closePath(); ctx.stroke();
                ctx.fillStyle = '#38bdf8'; (dbg.markers || []).forEach(m => ctx.fillRect(m.x * f - 5, m.y * f - 5, 10, 10));
                if (ly.circ) { ctx.strokeStyle = '#e879f9'; ctx.lineWidth = 1; (dbg.cands || []).forEach(c => { ctx.beginPath(); ctx.arc(c.x * f, c.y * f, c.r * f, 0, 6.3); ctx.stroke(); }); }
            }
            ptsOf = (q, o) => { const b = LJKSpec.bubbleMM(q, o); return toOut(b.x, b.y); };
            if (ly.kisi) {   // garis baris & kolom melalui pusat bulatan (mengikuti lengkung kertas di "Foto asli")
                ctx.strokeStyle = '#facc15aa'; ctx.lineWidth = Math.max(1, R / 5);
                for (let rr = 0; rr < P.rows; rr++) { ctx.beginPath(); let first = true; for (let b = 0; b < P.blocks; b++) for (let o = 0; o < LET.length; o++) { const q = b * P.rows + rr, p = ptsOf(q, o); first ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); first = false; } ctx.stroke(); }
                for (let b = 0; b < P.blocks; b++) for (let o = 0; o < LET.length; o++) { ctx.beginPath(); for (let rr = 0; rr < P.rows; rr++) { const p = ptsOf(b * P.rows + rr, o); rr ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.stroke(); }
            }
        } else {
            const geo = r.geo, L = geo.layout, ROWS = Math.ceil(L.questions / L.blocks);
            if (ly.view === 'rect') {
                const rc = LJKEngine.rectifyLattice(S.lastImage, geo, 1000);
                ctx = putGray(cv, rc.w, rc.h, rc.data); toOut = (u, v) => rc.toOut(u, v); R = geo.R0 * rc.k;
            } else {
                const f = Math.min(1, 1000 / dbg.W), g = f < 1 ? downs(dbg.g, dbg.W, dbg.H, f) : { w: dbg.W, h: dbg.H, d: dbg.g };
                ctx = putGray(cv, g.w, g.h, g.d); toOut = (u, v) => { const p = geo.map(u, v); return { x: p.x * f, y: p.y * f }; }; R = geo.R0 * f;
                if (ly.circ) { ctx.strokeStyle = '#e879f9'; ctx.lineWidth = 1; (dbg.cands || []).forEach(c => { ctx.beginPath(); ctx.arc(c.x * f, c.y * f, c.r * f, 0, 6.3); ctx.stroke(); }); }
            }
            ptsOf = (q, o) => { const b = Math.floor(q / ROWS), rr = q % ROWS; return toOut(geo.colU[b * L.options + o], geo.rowV[rr]); };
            if (ly.kisi) {
                ctx.strokeStyle = '#facc15aa'; ctx.lineWidth = Math.max(1, R / 5);
                geo.rowV.forEach(v => { ctx.beginPath(); geo.colU.forEach((u, i) => { const p = toOut(u, v); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.stroke(); });
                geo.colU.forEach(u => { ctx.beginPath(); geo.rowV.forEach((v, i) => { const p = toOut(u, v); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.stroke(); });
            }
        }
        // bulatan + kehitaman + keyakinan
        ctx.textAlign = 'center';
        for (let q = 0; q < n; q++) {
            LET.forEach((Lt, o) => {
                const p = ptsOf(q, o), col = bubbleColor(q, Lt);
                ctx.beginPath(); ctx.arc(p.x, p.y, R * 1.15, 0, 6.3);
                ctx.strokeStyle = col || '#3b82f655'; ctx.lineWidth = col ? Math.max(2, R / 3) : 1; ctx.stroke();
                if (ly.dark && r.dark[q]) { ctx.font = `${Math.max(8, R * 0.9)}px sans-serif`; ctx.fillStyle = '#f43f5e'; ctx.fillText(Math.round(r.dark[q][o] * 100), p.x, p.y - R * 1.35); }
            });
            if (ly.conf) {
                const p = ptsOf(q, 0), st = S.status[q], cf = r.conf ? r.conf[q] : 1;
                ctx.beginPath(); ctx.arc(p.x - R * 3.1, p.y, R * 0.55, 0, 6.3);
                ctx.fillStyle = st === 'double' || st === 'weak' ? '#f59e0b' : st === 'blank' ? '#94a3b8' : cf > 0.5 ? '#22c55e' : '#a3e635'; ctx.fill();
            }
        }
    }
    function downs(g, W, H, f) { const w = Math.round(W * f), h = Math.round(H * f), d = new Uint8ClampedArray(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = g[Math.min(H - 1, Math.floor(y / f)) * W + Math.min(W - 1, Math.floor(x / f))]; return { w, h, d }; }
    function renderQuality() {
        const q = S.res.quality || {}, items = [
            ['Kualitas', (q.grade || '-') + (q.score != null ? ' (' + q.score + ')' : '')], ['Skala', q.pxPerMm != null ? q.pxPerMm + ' px/mm' : '-'],
            ['Residu kisi', q.residMm != null ? q.residMm + ' mm' : '-'], ['Cahaya rata', q.light != null ? Math.round(q.light * 100) + '%' : '-'],
            ['Ketajaman', q.sharp != null ? q.sharp : '-'], ['Kemiringan', q.tilt != null ? q.tilt + '°' : '-']];
        $('qualGrid').innerHTML = items.map(([a, b]) => `<div><span class="muted">${a}</span><b>${esc(b)}</b></div>`).join('');
    }

    // ---- identitas
    function setupIdentity() {
        const u = S.exam, sts = examStudents(u), kelas = [...new Set(sts.map(s => s.kelas))].sort();
        $('selKelas').innerHTML = '<option value="">Kelas…</option>' + kelas.map(k => `<option>${esc(k)}</option>`).join('');
        if (kelas.length === 1) $('selKelas').value = kelas[0];
        fillStudents(); $('ocrAlts').innerHTML = ''; $('ocrStatus').textContent = ''; $('cariSiswa').value = ''; $('cariHasil').innerHTML = ''; $('selSiswa').value = ''; showPicked();
        S.ident = { nomor: '' };
        const r = S.res;
        if (r.mode !== 'marker') { identityLegacy(r); return; }
        const strips = LJKEngine.identityStrips(S.lastImage, r.geo, 12);
        $('idStrips').innerHTML = '';
        const b64 = {};
        ['nama', 'nomor', 'kelas'].forEach(k => {
            const s = strips[k], c = document.createElement('canvas'); c.width = s.w; c.height = s.h; c.className = 'strip';
            c.style.width = Math.round(s.w / strips.nama.w * 100) + '%';
            const id = c.getContext('2d').createImageData(s.w, s.h); id.data.set(s.data); c.getContext('2d').putImageData(id, 0, 0);
            $('idStrips').appendChild(c);
            if (s.inkRatio > 0.003) b64[k] = c.toDataURL('image/jpeg', 0.9).split(',')[1];
        });
        if (!S.ocr) { $('ocrStatus').textContent = 'OCR mati — pilih kelas & nama.'; return; }
        if (!Object.keys(b64).length) { $('ocrStatus').innerHTML = '<span style="color:#fcd34d">Kolom identitas tampak kosong. Pilih manual.</span>'; return; }
        if (!navigator.onLine) { $('ocrStatus').textContent = 'Offline — pilih kelas & nama secara manual.'; return; }
        const scan = S.scanId;
        $('ocrStatus').textContent = 'Membaca identitas (OCR Google)…';
        Promise.all(['nama', 'nomor', 'kelas'].map(k => b64[k] ? apiPost({ action: 'ocr', image: b64[k] }).then(j => j.text || '').catch(e => { S.ocrErr = e.message; return ''; }) : Promise.resolve('')))
            .then(([nama, nomor, kelas]) => { if (scan !== S.scanId) return; applyIdentity(LJKIdent.fromFields({ nama, nomor, kelas })); });
    }
    // LJK lama: satu potongan berlabel -> OCR -> parse -> cocokkan
    function identityLegacy(r) {
        const rc = LJKEngine.identLattice(S.lastImage, r.geo, 1100);
        const c = document.createElement('canvas'); c.className = 'strip'; putGray(c, rc.w, rc.h, rc.data);
        $('idStrips').innerHTML = ''; $('idStrips').appendChild(c);
        if (!S.ocr) { $('ocrStatus').textContent = 'OCR mati — pilih kelas & nama.'; return; }
        if (!navigator.onLine) { $('ocrStatus').textContent = 'Offline — pilih kelas & nama secara manual.'; return; }
        const scan = S.scanId;
        $('ocrStatus').textContent = 'Membaca identitas (OCR Google)…';
        apiPost({ action: 'ocr', image: c.toDataURL('image/jpeg', 0.9).split(',')[1] }).then(j => j.text || '').catch(e => { S.ocrErr = e.message; return ''; })
            .then(t => { if (scan !== S.scanId) return; const f = LJKIdent.parse(t); f.nomor = LJKIdent.digits(f.nomor); applyIdentity(f); });
    }
    function applyIdentity(f) {
        const sts = examStudents(S.exam), m = LJKIdent.match(f, sts);
        S.ident = { nomor: f.nomor }; log(`OCR: nama="${f.nama}" nomor="${f.nomor}" kelas="${f.kelas}"`);
        if (!f.nama && !f.nomor && !f.kelas) { $('ocrStatus').innerHTML = `<span style="color:#fcd34d">OCR tidak membaca apa pun${S.ocrErr ? ' (' + esc(S.ocrErr) + ')' : ''}. Pilih manual.</span>`; return; }
        const best = (m.alternatives || [])[0], read = f.nama || f.nomor;
        $('ocrStatus').innerHTML = !read ? '<span style="color:#fcd34d">OCR tidak membaca nama. Cari / pilih siswa secara manual.</span>'
            : (!best || best.skor < 0.8) ? `<span style="color:#fcd34d">OCR membaca "<b>${esc(read)}</b>" — tidak ada nama yang cocok di daftar. Cari manual, atau ketuk saran terdekat.</span>`
            : `OCR membaca "<b>${esc(read)}</b>". Rekomendasi (ketuk untuk memilih):`;
        $('ocrAlts').innerHTML = (m.alternatives || []).filter(a => a.skor >= 0.3).map((a, i) => `<span class="chip ${i === 0 && a.skor >= 0.8 ? 'rec' : ''}" data-n="${esc(a.nama)}" data-k="${esc(a.kelas)}">${esc(a.nama)} (${esc(a.kelas)}) ${Math.round(a.skor * 100)}%</span>`).join('');
        $('ocrAlts').onclick = (e) => { const d = e.target.dataset; if (!d || !d.n) return; pickStudent(d.n, d.k); };
    }
    function pickStudent(nama, kelas) { $('selKelas').value = kelas; fillStudents(); $('selSiswa').value = nama; $('cariSiswa').value = ''; $('cariHasil').innerHTML = ''; showPicked(); }
    function showPicked() { const n = $('selSiswa').value, k = $('selKelas').value; $('pilihan').innerHTML = n ? `<span style="color:#86efac">✓ <b>${esc(n)}</b> (${esc(k)})</span>` : '<span style="color:#fcd34d">Belum ada siswa dipilih</span>'; }
    // cari lintas kelas: mengandung kata kunci, atau mirip (toleran salah ketik)
    function searchStudents() {
        const q = $('cariSiswa').value.trim().toUpperCase(), u = S.exam; if (!u) return;
        if (!q) { $('cariHasil').innerHTML = ''; return; }
        const done = new Set(u.terscan || []);
        const hasil = examStudents(u).map(st => ({ st, v: st.nama.indexOf(q) >= 0 ? 2 : LJKIdent.nameSim(q, st.nama) })).filter(x => x.v >= 0.5).sort((a, b) => b.v - a.v).slice(0, 10);
        $('cariHasil').innerHTML = hasil.length ? hasil.map(x => `<div class="hit" data-n="${esc(x.st.nama)}" data-k="${esc(x.st.kelas)}">${done.has(x.st.kelas + '|' + x.st.nama) ? '✓ ' : ''}${esc(x.st.nama)}<span class="muted"> ${esc(x.st.kelas)}</span></div>`).join('') : '<div class="muted small" style="padding:6px">Tidak ada nama yang cocok.</div>';
    }
    function fillStudents() {
        const u = S.exam; if (!u) return;
        const k = $('selKelas').value, done = new Set(u.terscan || []);
        const list = examStudents(u).filter(s => !k || s.kelas === k).sort((a, b) => a.nama.localeCompare(b.nama));
        $('selSiswa').innerHTML = '<option value="">Nama siswa…</option>' + list.map(s => `<option value="${esc(s.nama)}">${done.has(s.kelas + '|' + s.nama) ? '✓ ' : ''}${esc(s.nama)}</option>`).join('');
    }

    // ---- simpan + antrean offline
    async function save() {
        const u = S.exam, kelas = $('selKelas').value, nama = $('selSiswa').value;
        if (!kelas || !nama) return toast('Pilih kelas dan nama siswa dulu');
        const fl = flagged();
        if (fl.length && !S.confirm) { S.confirm = true; toast('Nomor ' + fl.join(', ') + ' perlu dicek. Tekan Simpan sekali lagi untuk tetap menyimpan.', 4500); return; }
        if ((u.terscan || []).indexOf(kelas + '|' + nama) >= 0 && S.confirmDup !== nama) { S.confirmDup = nama; toast(nama + ' sudah pernah discan. Tekan Simpan lagi untuk menimpa (scan terakhir yang dipakai).', 4500); return; }
        const st = examStudents(u).find(s => s.kelas === kelas && s.nama === nama) || {};
        const payload = { action: 'save', examId: u.id, siswa: { nama, kelas, nomor: st.nomor || (S.ident && S.ident.nomor) || '', nisn: st.nisn || '' },
            answers: S.answers.slice(0, u.jumlah).map(a => a || '-'), flags: fl, mode: S.res.mode, quality: S.res.quality ? S.res.quality.grade + S.res.quality.score : '', scanId: S.scanId };
        $('btnSave').disabled = true; busy(true, `Menyimpan hasil ${nama} ke database…`);
        try {
            const r = await apiPost(payload);
            toast(`✅ Tersimpan — ${nama}: ${r.skor} (${r.benar}/${r.jumlah})`);
            markScanned(u, kelas, nama);
        } catch (e) {
            if (/fetch|network|Load failed/i.test(e.message) || !navigator.onLine) { S.queue.push(payload); store.set('queue', S.queue); markScanned(u, kelas, nama); toast('Offline: disimpan di antrean, akan dikirim otomatis'); }
            else { busy(false); toast('Gagal simpan: ' + e.message, 5000); $('btnSave').disabled = false; return; }
        }
        busy(false);
        $('btnSave').disabled = false; S.confirm = false; S.confirmDup = null;
        backToScan();
    }
    function markScanned(u, kelas, nama) { u.terscan = u.terscan || []; if (u.terscan.indexOf(kelas + '|' + nama) < 0) u.terscan.push(kelas + '|' + nama); store.set('exams', S.data); }
    async function flushQueue(manual) {
        if (!S.queue.length || !S.token) return;
        const rest = [];
        homeLoading(`Mengirim ${S.queue.length} hasil antrean…`);
        for (const p of S.queue) { try { await apiPost(p); } catch (e) { rest.push(p); } }
        const sent = S.queue.length - rest.length; S.queue = rest; store.set('queue', rest); homeLoading(null);
        if (sent) toast(`${sent} hasil antrean terkirim`); else if (manual) toast('Masih belum bisa mengirim antrean');
        renderHome();
    }
    function backToScan() { if (S.scanMode === 'markerless' || S.exam) { go('scan'); startLoop(); if (!S.stream) startScan(S.exam ? S.data.ujian.indexOf(S.exam) : null, S.scanMode); } else go('home'); }

    // ------------------------------------------------------------ analisis
    function openAnalysis(i) {
        S.exam = S.data.ujian[i];
        $('anTitle').innerHTML = 'Analisis butir<span class="sub">' + esc(S.exam.nama + ' · ' + S.exam.mapel) + '</span>';
        S.anScope = { lingkup: 'tingkat', kelas: '' };
        const kls = S.exam.kelas.filter(k => k !== 'SEMUA');
        $('anScope').innerHTML = `<span class="chip on" data-s="tingkat">Seluruh tingkat ${esc(S.exam.tingkat || '')}</span>` + kls.map(k => `<span class="chip" data-s="kelas" data-k="${esc(k)}">Kelas ${esc(k)}</span>`).join('');
        $('anScope').onclick = (e) => { const d = e.target.dataset; if (!d || !d.s) return; S.anScope = { lingkup: d.s, kelas: d.k || '' }; [...$('anScope').children].forEach(c => c.classList.toggle('on', c === e.target)); };
        $('anOut').innerHTML = ''; go('analysis');
    }
    async function runAnalysis() {
        busy(true, 'Menghitung analisis butir…');
        try {
            const r = await apiPost({ action: 'analyze', examId: S.exam.id, lingkup: S.anScope.lingkup, kelas: S.anScope.kelas });
            const R = r.ringkasan || {};
            const box = (a, b) => `<div><span class="muted">${a}</span><b>${esc(b == null ? '-' : b)}</b></div>`;
            let h = `<div class="card"><h3>Ringkasan</h3>${(r.peringatan || []).map(p => `<div class="note n-warn">${esc(p)}</div>`).join('')}<div class="qgrid">` +
                box('Siswa', R.n) + box('Soal', R.k) + box('Rata-rata', R.rataRata) + box('Simpangan baku', R.sd) + box('KR-20', R.kr20 != null ? R.kr20 + ' ' + R.kategoriKr20 : '-') + box('SEM', R.sem) +
                box('Tuntas', (R.tuntas || 0) + ' (' + (R.persenTuntas || 0) + '%)') + box('Diterima', R.diterima) + box('Revisi / Buang', (R.direvisi || 0) + ' / ' + (R.dibuang || 0)) +
                `</div><p class="muted small">Lembar lengkap: sheet <b>${esc(r.sheet)}</b> di spreadsheet sekolah.</p><button class="btn pri wide" onclick="App.saveBank()">Simpan ke Bank Soal</button></div>`;
            h += `<div class="card" style="overflow-x:auto"><h3>Butir soal</h3><table class="t"><tr><th>No</th><th>Kunci</th><th>P</th><th>D</th><th>r</th><th>Rekomendasi</th></tr>` +
                (r.butir || []).map(b => `<tr class="${b.rekomendasi === 'Diterima' ? 'tr-ok' : b.rekomendasi === 'Dibuang' ? 'tr-bad' : 'tr-rev'}"><td>${b.no}</td><td>${b.kunci}</td><td>${b.p}<br><span class="muted">${b.tk}</span></td><td>${b.d == null ? '-' : b.d}<br><span class="muted">${b.dp}</span></td><td>${b.rpbis == null ? '-' : b.rpbis}<br><span class="muted">${b.valid ? 'valid' : 'tidak'}</span></td><td><b>${b.rekomendasi}</b><br><span class="muted">${esc(b.alasan)}</span></td></tr>`).join('') + '</table></div>';
            $('anOut').innerHTML = h;
        } catch (e) { $('anOut').innerHTML = `<div class="note n-bad">${esc(e.message)}</div>`; } finally { busy(false); }
    }
    async function saveBank() {
        busy(true, 'Menyimpan ke Bank Soal…');
        try { const r = await apiPost({ action: 'bank', examId: S.exam.id, lingkup: S.anScope.lingkup, kelas: S.anScope.kelas }); toast(`Bank Soal: ${r.baru} baru, ${r.diperbarui} diperbarui`); }
        catch (e) { toast(e.message); } finally { busy(false); }
    }

    // ------------------------------------------------------------ cetak
    function openPrint(i) { S.exam = S.data.ujian[i]; $('prTitle').innerHTML = 'Cetak LJK<span class="sub">' + esc(S.exam.nama) + '</span>'; $('prVar').value = S.exam.jumlah <= 20 && S.exam.opsi === 'ABCD' ? 'LAMA20' : S.exam.opsi; renderPrint(); go('print'); }
    function renderPrint() {
        const sk = (S.config && S.config.sekolah) || {}, u = S.exam;
        const v = $('prVar').value, ex = { judul: u ? u.nama.toUpperCase() : '', mapel: u ? u.mapel : '', tahun: sk.tahun };
        const svg = v === 'LAMA20' ? LJKTemplate.renderLJKLama({ school: { nama: sk.nama, logo: sk.logo }, exam: ex })
            : LJKTemplate.renderLJK({ variant: v, school: { nama: sk.nama, logo: sk.logo }, exam: ex });
        $('prPreview').innerHTML = svg.replace(/width="215mm" height="330mm"/, 'width="100%"');
        const n = Math.max(1, Math.min(60, Number($('prCopies').value) || 1));
        $('printArea').innerHTML = Array(n).fill(svg).join('');
    }

    // ------------------------------------------------------------ tuning
    function toggleTuning() { const t = $('tuning'); t.style.display = t.style.display === 'none' ? '' : 'none'; if (t.style.display === '') t.scrollIntoView({ behavior: 'smooth' }); }
    function param(k, v) { S.params[k] = Number(v); store.set('params', S.params); $(k === 'sens' ? 'vSens' : 'vCon').textContent = v; }
    function setOcr(v) { S.ocr = v; store.set('ocr', v); }

    // ------------------------------------------------------------ mulai
    function init() {
        $('slSens').value = S.params.sens; $('vSens').textContent = S.params.sens; $('slCon').value = S.params.con; $('vCon').textContent = S.params.con; $('chkOcr').checked = S.ocr;
        $('inApi').value = S.api;
        if (!S.api) go('setup');
        else if (!S.token) { go('login'); renderLogin(); }
        else { go('home'); loadExams(true); }
        window.addEventListener('online', () => flushQueue());
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
    }
    document.addEventListener('DOMContentLoaded', () => {
        $('cariSiswa').addEventListener('input', searchStudents);
        $('cariHasil').addEventListener('click', (e) => { const d = e.target.closest('.hit'); if (d) pickStudent(d.dataset.n, d.dataset.k); });
        $('selSiswa').addEventListener('change', showPicked); $('selKelas').addEventListener('change', showPicked);
    });
    window.App = { go, saveApi, logout, loadExams, flushQueue, editExam, setOpsi, keyTyped, keyClear, saveExam, archiveExam, startScan, stopScan, setAuto, capture, fromFile, backToScan, save, fillStudents, openAnalysis, runAnalysis, saveBank, openPrint, renderPrint, toggleTuning, param, reprocess, setOcr, _S: S };
    document.addEventListener('DOMContentLoaded', init);
})();
