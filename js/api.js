/* ===========================================================
   ÜLKEYİ YÖNET — Çevrimiçi skor tablosu istemcisi
   Sunucu: server/app.py (SQLite). Ulaşılamazsa oyun cihazdaki tabloyla devam eder.
   =========================================================== */
(function (global) {
  'use strict';
  const PLAYER_KEY = 'ulkeyiYonetPlayer_v1';
  const base = () => String(global.ULKE_API || '').replace(/\/+$/, '');
  const A = { online: null };

  async function call(path, opts) {
    opts = opts || {};
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeout || 5000);
    try {
      const res = await fetch(base() + path, {
        method: opts.method || 'GET',
        headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctl.signal, cache: 'no-store',
      });
      const type = res.headers.get('content-type') || '';
      if (!type.includes('application/json')) { A.online = false; throw { offline: true, message: 'Skor sunucusuna ulaşılamıyor.' }; }
      const data = await res.json();
      A.online = true;
      if (!res.ok) throw { status: res.status, message: data.error || 'İstek başarısız.' };
      return data;
    } catch (e) {
      if (e && (e.status || e.offline)) throw e;
      A.online = false;
      throw { offline: true, message: 'Skor sunucusuna ulaşılamıyor.' };
    } finally { clearTimeout(timer); }
  }

  function player() { try { return JSON.parse(localStorage.getItem(PLAYER_KEY)) || null; } catch (e) { return null; } }
  function setPlayer(p) { try { if (p) localStorage.setItem(PLAYER_KEY, JSON.stringify(p)); else localStorage.removeItem(PLAYER_KEY); } catch (e) { /* yoksay */ } }

  const health = () => call('/api/health', { timeout: 3000 });
  const checkName = name => call('/api/players/check?name=' + encodeURIComponent(name));
  async function register(name) {
    const r = await call('/api/players', { method: 'POST', body: { name } });
    const p = { id: r.id, name: r.name, token: r.token, online: true };
    setPlayer(p); return p;
  }
  function submit(entry) {
    const p = player(); if (!p || !p.token) return Promise.reject({ offline: true, message: 'Çevrimiçi oyuncu kaydı yok.' });
    return call('/api/scores', { method: 'POST', body: Object.assign({ token: p.token }, entry) });
  }
  function top(scenario, limit) {
    const p = player();
    return call(`/api/scores?scenario=${encodeURIComponent(scenario || 'all')}&limit=${limit || 20}` + (p && p.name ? '&player=' + encodeURIComponent(p.name) : ''));
  }

  global.Api = { health, checkName, register, submit, top, player, setPlayer, state: A };
})(typeof window !== 'undefined' ? window : globalThis);
