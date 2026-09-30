/* ===========================================================
   ÜLKEYİ YÖNET — Çevrimiçi skor tablosu istemcisi
   Sunucu: server/app.py (SQLite). Ulaşılamazsa oyun cihazdaki tabloyla devam eder.
   =========================================================== */
(function (global) {
  'use strict';
  const PLAYER_KEY = 'ulkeyiYonetPlayer_v1';
  const base = () => String(global.ULKE_API || '').replace(/\/+$/, '');
  const A = { online: null };

  // Sunucu biçimi: 'pretty' -> /api/scores (Python sunucusu ya da Apache yönlendirmesi),
  //                'php'    -> /api/index.php?r=/scores (yönlendirme yoksa, ör. yalnız nginx)
  let mode = null, lastFail = 0;
  function url(route, query, m) {
    const qs = query ? new URLSearchParams(query).toString() : '';
    return m === 'php' ? `${base()}/api/index.php?r=${encodeURIComponent(route)}${qs ? '&' + qs : ''}` : `${base()}/api${route}${qs ? '?' + qs : ''}`;
  }
  async function raw(route, query, opts, m) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeout || 5000);
    try {
      const res = await fetch(url(route, query, m), {
        method: opts.method || 'GET',
        headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctl.signal, cache: 'no-store',
      });
      const type = res.headers.get('content-type') || '';
      if (!type.includes('application/json')) return { unreachable: true };
      return { res, data: await res.json() };
    } catch (e) { return { unreachable: true }; }
    finally { clearTimeout(timer); }
  }
  async function detect() {
    if (mode) return mode;
    if (Date.now() - lastFail < 20000) return null;
    for (const m of ['pretty', 'php']) {
      const r = await raw('/health', null, { timeout: 3500 }, m);
      if (!r.unreachable && r.res.ok && r.data && r.data.ok) { mode = m; return m; }
    }
    lastFail = Date.now(); return null;
  }
  async function call(route, query, opts) {
    opts = opts || {};
    const m = await detect();
    if (!m) { A.online = false; throw { offline: true, message: 'Skor sunucusuna ulaşılamıyor.' }; }
    const r = await raw(route, query, opts, m);
    if (r.unreachable) { A.online = false; mode = null; lastFail = Date.now(); throw { offline: true, message: 'Skor sunucusuna ulaşılamıyor.' }; }
    A.online = true;
    if (!r.res.ok) throw { status: r.res.status, message: r.data.error || 'İstek başarısız.' };
    return r.data;
  }

  function player() { try { return JSON.parse(localStorage.getItem(PLAYER_KEY)) || null; } catch (e) { return null; } }
  function setPlayer(p) { try { if (p) localStorage.setItem(PLAYER_KEY, JSON.stringify(p)); else localStorage.removeItem(PLAYER_KEY); } catch (e) { /* yoksay */ } }

  const health = () => call('/health', null, { timeout: 3000 });
  const checkName = name => call('/players/check', { name });
  async function register(name) {
    const r = await call('/players', null, { method: 'POST', body: { name } });
    const p = { id: r.id, name: r.name, token: r.token, online: true };
    setPlayer(p); return p;
  }
  function submit(entry) {
    const p = player(); if (!p || !p.token) return Promise.reject({ offline: true, message: 'Çevrimiçi oyuncu kaydı yok.' });
    return call('/scores', null, { method: 'POST', body: Object.assign({ token: p.token }, entry) });
  }
  function top(scenario, limit) {
    const p = player(); const q = { scenario: scenario || 'all', limit: String(limit || 20) };
    if (p && p.name) q.player = p.name;
    return call('/scores', q);
  }

  global.Api = { health, checkName, register, submit, top, player, setPlayer, state: A, mode: () => mode, reset: () => { mode = null; lastFail = 0; } };
})(typeof window !== 'undefined' ? window : globalThis);
