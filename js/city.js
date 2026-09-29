/* ===========================================================
   ÜLKEYİ YÖNET — Canlı Şehir Sahnesi (Canvas)
   Vatandaşlar, binalar, arabalar, hava ve gündüz/gece döngüsü.
   =========================================================== */
(function (global) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const SKIN = ['#f1c9a5', '#e0ac7e', '#c68642', '#8d5524', '#f6d3b8'];

  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(c1, c2, t) { const a = hexToRgb(c1), b = hexToRgb(c2); return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`; }
  function hash(n) { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // gökyüzü renk anahtarları: [t, üst, alt]
  const SKY = [
    [0.00, '#0a1230', '#1b2a55'], [0.20, '#0a1230', '#1b2a55'], [0.27, '#f39a5b', '#ffd6a0'], [0.35, '#79c3f2', '#d9f0ff'],
    [0.70, '#6fbbf0', '#d2ecff'], [0.80, '#f28c63', '#ffd1a3'], [0.88, '#2b2b5e', '#4b3a6e'], [1.00, '#0a1230', '#1b2a55'],
  ];
  function skyColors(t) {
    for (let i = 0; i < SKY.length - 1; i++) {
      if (t >= SKY[i][0] && t <= SKY[i + 1][0]) {
        const k = (t - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]);
        return [mix(SKY[i][1], SKY[i + 1][1], k), mix(SKY[i][2], SKY[i + 1][2], k)];
      }
    }
    return [SKY[0][1], SKY[0][2]];
  }
  function nightness(t) { // 0 gündüz .. 1 gece
    if (t < 0.22 || t > 0.9) return 1;
    if (t < 0.34) return 1 - (t - 0.22) / 0.12;
    if (t > 0.78) return (t - 0.78) / 0.12;
    return 0;
  }

  class City {
    constructor(canvas, opts) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.opts = opts || {};
      this.tod = 0.4; this.time = 0; this.last = performance.now();
      this.state = null; this.season = 'yaz'; this.rain = false;
      this.agents = []; this.cars = []; this.smoke = []; this.clouds = []; this.drops = []; this.floaters = [];
      this.bubble = null; this.hover = null; this.buildings = [];
      this.signs = ['ZAM İSTİYORUZ'];
      this.priceTag = { flash: 0 };
      this.war = null; this.wasWar = false; this.planes = []; this.bombs = []; this.explosions = []; this.scorch = []; this.tracers = []; this.damage = {}; this.fire = []; this.sirenT = 0; this.planeT = 2;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      canvas.addEventListener('mousemove', e => this.onMove(e));
      canvas.addEventListener('mouseleave', () => { this.hover = null; this.opts.onHover && this.opts.onHover(null); });
      canvas.addEventListener('click', e => this.onClick(e));
      // Dokunmatik: kısa dokunuşu tıklama say, kaydırmayı sayfaya bırak
      canvas.addEventListener('touchstart', e => { const t = e.touches[0]; this.touch = { x: t.clientX, y: t.clientY, t: Date.now() }; }, { passive: true });
      canvas.addEventListener('touchend', e => { const t = e.changedTouches[0]; if (!this.touch) return; const moved = Math.hypot(t.clientX - this.touch.x, t.clientY - this.touch.y); const dt = Date.now() - this.touch.t; this.touch = null; if (moved < 12 && dt < 600) { this.lastTouchClick = Date.now(); this.onClick({ clientX: t.clientX, clientY: t.clientY, touch: true }); } }, { passive: true });
      for (let i = 0; i < 5; i++) this.clouds.push({ x: Math.random(), y: 0.08 + Math.random() * 0.22, s: 0.6 + Math.random() * 0.8, v: 0.004 + Math.random() * 0.006 });
      requestAnimationFrame(t => this.frame(t));
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      this.W = this.canvas.clientWidth; this.H = this.canvas.clientHeight;
      this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.gy = Math.round(this.H * 0.68);
      this.layout();
      if (this.agents.length) this.agents.forEach(a => { a.x = clamp(a.x, 0, this.W); });
    }

    layout() {
      const W = this.W; const list = [];
      const plan = [
        { t: 'tree', w: 26 }, { t: 'apt', w: 70, h: 120 }, { t: 'cb', w: 130 }, { t: 'apt', w: 56, h: 90 }, { t: 'tree', w: 24 }, { t: 'meclis', w: 150 },
        { t: 'tree', w: 24 }, { t: 'market', w: 96 }, { t: 'apt', w: 64, h: 140 }, { t: 'bank', w: 90 }, { t: 'apt', w: 60, h: 105 }, { t: 'tree', w: 24 },
        { t: 'factory', w: 130 }, { t: 'site', w: 90 }, { t: 'apt', w: 66, h: 125 }, { t: 'tree', w: 26 },
      ];
      let total = plan.reduce((a, b) => a + b.w + 10, 0);
      const scale = clamp(W / total, 0.62, 1.25);
      let x = 6;
      plan.forEach(b => {
        const w = b.w * scale;
        list.push(Object.assign({}, b, { x, w: w, s: scale }));
        x += w + 10 * scale;
      });
      // sağ boşluk varsa ortala
      const off = Math.max(0, (W - x) / 2);
      list.forEach(b => b.x += off);
      this.buildings = list;
      this.benches = list.filter(b => b.t === 'tree').map(b => b.x + b.w / 2);
    }

    setState(state, extra) {
      const first = !this.state;
      this.state = state;
      const m = state.month;
      this.season = (m === 12 || m <= 2) ? 'kis' : (m <= 5 ? 'ilkbahar' : (m <= 8 ? 'yaz' : 'sonbahar'));
      if (extra && extra.newMonth) {
        this.rain = Math.random() < (this.season === 'kis' || this.season === 'sonbahar' ? 0.35 : 0.1);
        if (state.infl / 12 > 2.2) this.priceTag.flash = 4;
      }
      this.signs = global.Voices ? Voices.pickSigns(state) : ['ZAM İSTİYORUZ'];
      if (first) this.spawnAgents();
      this.occupied = !!(state.gameOver && state.gameOver.type === 'isgal');
      if (this.occupied && !this.occupiedShown) { this.occupiedShown = true; for (let i = 0; i < 6; i++) { const b = this.buildings[Math.floor(Math.random() * this.buildings.length)]; if (b.t !== 'tree') this.fire.push({ x: b.x + 8 + Math.random() * (b.w - 16), y: this.gy - Math.random() * this.bHeight(b) * 0.8, ttl: 9999 }); } this.cars.forEach(c => c.tank = true); }
      this.war = state.war && state.war.active ? state.war : null;
      if (this.war && !this.wasWar) this.startWar(); else if (!this.war && this.wasWar) this.endWar();
      this.wasWar = !!this.war;
      this.assignRoles();
    }

    spawnAgents() {
      const segs = Model.SEGMENTS; this.agents = [];
      const N = clamp(Math.round(this.W / 22), 26, 48);
      for (let i = 0; i < N; i++) {
        let r = hash(i + 3), seg = segs[0], acc = 0;
        for (const s of segs) { acc += s.share; if (r <= acc) { seg = s; break; } }
        this.agents.push({
          id: i, seg: seg.id, color: seg.color, skin: SKIN[Math.floor(hash(i + 9) * SKIN.length)],
          x: hash(i + 1) * this.W, depth: hash(i + 2), dir: hash(i + 5) > 0.5 ? 1 : -1, speed: 14 + hash(i + 7) * 16,
          phase: hash(i + 11) * TAU, mood: 55, moodOff: (hash(i + 13) - 0.5) * 24, state: 'walk', idle: 0, emote: null, emoteT: hash(i + 17) * 8 + 3, targetX: null,
        });
      }
    }

    assignRoles() {
      const s = this.state; if (!s) return;
      const anger = s.anger, unemp = s.unemp;
      const nProt = anger > 58 ? Math.round(2 + (anger - 58) / 42 * 12) : 0;
      const nSit = Math.round(clamp((unemp - 4) / 100 * this.agents.length * 1.6, 0, this.agents.length * 0.3));
      const meclis = this.buildings.find(b => b.t === 'meclis');
      // öfkeliler önce protestoya
      const sorted = this.agents.slice().sort((a, b) => a.mood - b.mood);
      this.agents.forEach(a => { if (a.state === 'protest' || a.state === 'sit') a.state = 'walk'; });
      for (let i = 0; i < nProt && i < sorted.length; i++) {
        const a = sorted[i]; a.state = 'protest';
        a.targetX = meclis ? meclis.x + 14 + hash(a.id + 31) * (meclis.w - 28) : this.W / 2;
        a.sign = this.signs[a.id % this.signs.length];
      }
      this.agents.forEach(a => a.soldier = false);
      if (this.war && this.war.mobilized) { const pool = this.agents.filter(a => a.state === 'walk' && (a.seg === 'genc' || a.seg === 'isci')).slice(0, 7); pool.forEach(a => a.soldier = true); }
      let placed = 0;
      for (let i = nProt; i < sorted.length && placed < nSit; i++) {
        const a = sorted[i];
        if (a.seg === 'emekli') continue;
        a.state = 'sit'; a.benchX = this.benches[placed % this.benches.length] + (placed % 2 ? 9 : -9); placed++;
      }
    }

    // ---------- etkileşim ----------
    pos(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    agentAt(p) {
      let best = null, bd = 16;
      this.agents.forEach(a => { const ay = this.agentY(a) - 14; const d = Math.hypot(a.x - p.x, ay - p.y); if (d < bd) { bd = d; best = a; } });
      return best;
    }
    buildingAt(p) {
      if (p.y > this.gy) return null;
      return this.buildings.find(b => b.t !== 'tree' && p.x >= b.x && p.x <= b.x + b.w && p.y >= this.gy - this.bHeight(b)) || null;
    }
    onMove(e) {
      const p = this.pos(e); const a = this.agentAt(p); const b = a ? null : this.buildingAt(p);
      this.hover = a ? { agent: a } : (b ? { building: b } : null);
      this.canvas.style.cursor = this.hover ? 'pointer' : 'default';
      this.opts.onHover && this.opts.onHover(this.hover, p);
    }
    onClick(e) {
      if (!e.touch && this.lastTouchClick && Date.now() - this.lastTouchClick < 700) return; // dokunmadan sonra gelen sentetik tıklamayı yoksay
      const p = this.pos(e); const a = this.agentAt(p);
      if (e.touch) { const b = a ? null : this.buildingAt(p); this.hover = a ? { agent: a } : (b ? { building: b } : null); this.opts.onHover && this.opts.onHover(this.hover, Object.assign({ touch: true }, p)); }
      if (a) { const q = Voices.pickQuote(a.seg, a.mood); this.bubble = { agent: a, text: q, ttl: 4.5 }; a.idle = 3; this.opts.onAgentClick && this.opts.onAgentClick(a, q); return; }
      const b = this.buildingAt(p); if (b) this.opts.onBuildingClick && this.opts.onBuildingClick(b.t);
    }
    float(text, x, y, color) { const n = this.floaters.filter(f => Math.abs(f.x - x) < 60).length; this.floaters.push({ text, x, y: y - n * 16, ttl: 2.6, color: color || '#fff' }); }
    floatAt(type, text, color) { const b = this.buildings.find(b => b.t === type); if (b) this.float(text, b.x + b.w / 2, this.gy - this.bHeight(b) - 10, color); }

    // ---------- savaş ----------
    startWar() {
      this.planes = []; this.bombs = []; this.explosions = []; this.tracers = []; this.damage = {}; this.fire = []; this.planeT = 1.5; this.sirenT = 0;
      this.opts.onSound && this.opts.onSound('siren');
      this.floatAt('meclis', '⚠️ HAVA SALDIRISI', '#fca5a5');
    }
    endWar() { this.planes = []; this.bombs = []; this.tracers = []; this.scorchFade = 25; this.cars.forEach(c => c.tank = false); }
    updateWar(dt) {
      const s = this.state, w = this.war, W = this.W, gy = this.gy;
      const defense = s.defense / 100;
      const pressure = Math.max(0.15, (w.enemy - (w.power || War.power(s))) / 60 + 0.5); // 0.15..1.5
      // siren
      this.sirenT -= dt; if (this.sirenT <= 0) { this.sirenT = 22 + Math.random() * 15; this.opts.onSound && this.opts.onSound('siren'); }
      // uçaklar
      this.planeT -= dt;
      if (this.planeT <= 0) {
        this.planeT = (4.5 - pressure * 1.6) + Math.random() * 3;
        const dir = Math.random() > 0.5 ? 1 : -1;
        this.planes.push({ x: dir > 0 ? -70 : W + 70, dir, y: 24 + Math.random() * 40, speed: 130 + Math.random() * 60, dropX: 60 + Math.random() * (W - 120), dropped: false, bombs: 1 + (Math.random() < pressure * 0.5 ? 1 : 0) });
        this.opts.onSound && this.opts.onSound('plane');
      }
      this.planes.forEach(p => {
        p.x += p.dir * p.speed * dt;
        if (!p.dropped && ((p.dir > 0 && p.x >= p.dropX) || (p.dir < 0 && p.x <= p.dropX))) {
          p.dropped = true;
          for (let i = 0; i < p.bombs; i++) {
            const intercept = Math.random() < defense * 0.85;
            this.bombs.push({ x: p.x + i * 26 * p.dir, y: p.y + 8, vx: p.dir * p.speed * 0.5, vy: 30, intercept, hitY: intercept ? gy * (0.35 + Math.random() * 0.25) : gy + 4 + Math.random() * 16 });
          }
        }
      });
      this.planes = this.planes.filter(p => p.x > -120 && p.x < W + 120);
      // bombalar
      const meclis = this.buildings.find(b => b.t === 'meclis'); const aaX = meclis ? meclis.x + meclis.w - 10 : W / 2;
      this.bombs.forEach(b => {
        b.vy += 110 * dt; b.y += b.vy * dt; b.x += b.vx * dt * 0.6;
        if (b.y >= b.hitY) {
          b.dead = true;
          if (b.intercept) {
            this.explosions.push({ x: b.x, y: b.y, r: 4, max: 22, ttl: 0.5, air: true });
            this.tracers.push({ x1: aaX, y1: gy - (meclis ? this.bHeight(meclis) : 60), x2: b.x, y2: b.y, ttl: 0.35 });
            this.opts.onSound && this.opts.onSound('flak');
            this.float('✔ ÖNLENDİ', b.x, b.y - 10, '#86efac');
          } else {
            this.explosions.push({ x: b.x, y: b.y, r: 6, max: 46, ttl: 0.9, air: false });
            this.scorch.push({ x: b.x, y: Math.min(b.y, gy + 22), a: 1 });
            this.opts.onSound && this.opts.onSound('boom');
            this.shake = 0.35;
            // halk kaçışır
            this.agents.forEach(a => { const d = Math.abs(a.x - b.x); if (d < 110) { a.flee = { dir: a.x < b.x ? -1 : 1, ttl: 2.2 + Math.random() }; a.mood = Math.max(0, a.mood - 8); a.emote = { t: '😱', ttl: 1.5 }; } });
            // bina hasarı
            this.buildings.forEach((bd, i) => { if (bd.t !== 'tree' && Math.abs(bd.x + bd.w / 2 - b.x) < bd.w / 2 + 30) { this.damage[i] = Math.min(3, (this.damage[i] || 0) + 1); if (Math.random() < 0.6) this.fire.push({ bi: i, x: bd.x + 8 + Math.random() * (bd.w - 16), y: gy - Math.random() * this.bHeight(bd) * 0.8, ttl: 20 + Math.random() * 20 }); } });
            if (this.bubble) this.bubble = null;
          }
        }
      });
      this.bombs = this.bombs.filter(b => !b.dead);
    }

    // ---------- güncelleme ----------
    frame(t) {
      const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t; this.time += dt;
      this.tod = (this.tod + dt / 45) % 1;
      this.update(dt); this.draw();
      requestAnimationFrame(tt => this.frame(tt));
    }

    update(dt) {
      const s = this.state; if (!s) return;
      const W = this.W;
      if (this.war) this.updateWar(dt);
      this.explosions.forEach(e => { e.ttl -= dt; e.r += (e.max - e.r) * dt * 6; });
      this.explosions = this.explosions.filter(e => e.ttl > 0);
      this.tracers.forEach(t => t.ttl -= dt); this.tracers = this.tracers.filter(t => t.ttl > 0);
      this.fire.forEach(f => f.ttl -= dt); this.fire = this.fire.filter(f => f.ttl > 0);
      if (!this.war && this.scorch.length) { this.scorch.forEach(sc => sc.a -= dt / 25); this.scorch = this.scorch.filter(sc => sc.a > 0); }
      if (this.shake > 0) this.shake -= dt;
      // vatandaşlar
      this.agents.forEach(a => {
        const target = clamp(s.moods[a.seg] + a.moodOff, 0, 100);
        a.mood += (target - a.mood) * dt * 0.5;
        a.phase += dt * 7;
        if (a.flee) {
          a.flee.ttl -= dt; a.dir = a.flee.dir; a.x += a.dir * a.speed * 3.2 * dt;
          if (a.x < -10) a.x = W + 10; if (a.x > W + 10) a.x = -10;
          if (a.flee.ttl <= 0) a.flee = null;
        } else if (a.state === 'walk') {
          if (a.idle > 0) a.idle -= dt; else {
            a.x += a.dir * a.speed * dt * (0.8 + a.depth * 0.4);
            if (a.x < -10) { a.x = W + 10; } if (a.x > W + 10) { a.x = -10; }
            if (Math.random() < dt * 0.05) a.idle = 1 + Math.random() * 2;
            if (Math.random() < dt * 0.02) a.dir *= -1;
          }
        } else if (a.state === 'protest') {
          const dx = a.targetX - a.x;
          if (Math.abs(dx) > 3) { a.dir = Math.sign(dx); a.x += a.dir * a.speed * 1.3 * dt; a.marching = true; } else a.marching = false;
        } else if (a.state === 'sit') {
          const dx = a.benchX - a.x;
          if (Math.abs(dx) > 2) { a.dir = Math.sign(dx); a.x += a.dir * a.speed * dt; a.seated = false; } else a.seated = true;
        }
        a.emoteT -= dt;
        if (a.emoteT <= 0) {
          const bad = a.mood < 40, good = a.mood > 65;
          const pool = bad ? ['💢', '😟', '💸', '😠'] : (good ? ['😊', '👍', '🎉'] : ['🤔', '😐']);
          if (bad || good || Math.random() < 0.4) a.emote = { t: pool[Math.floor(Math.random() * pool.length)], ttl: 1.8 };
          a.emoteT = (bad ? 5 : 9) + Math.random() * 8;
        }
        if (a.emote) { a.emote.ttl -= dt; if (a.emote.ttl <= 0) a.emote = null; }
      });
      // arabalar
      const nCars = clamp(Math.round(2 + s.growth * 0.7 - (s.unemp - 8) * 0.3), 1, 9);
      while (this.cars.length < nCars) this.cars.push({ x: Math.random() * W, dir: Math.random() > 0.5 ? 1 : -1, speed: 40 + Math.random() * 40, color: ['#d94f4f', '#4f7ad9', '#e8b93b', '#e8e8e8', '#4fa66b', '#8e5bd9'][Math.floor(Math.random() * 6)], lane: Math.random() > 0.5 ? 0 : 1 });
      if (this.cars.length > nCars) this.cars.length = nCars;
      const mob = this.war && this.war.mobilized; this.cars.forEach((c, i) => { c.tank = mob && i % 2 === 0; });
      this.cars.forEach(c => { c.x += c.dir * c.speed * dt; if (c.x > W + 40) c.x = -40; if (c.x < -40) c.x = W + 40; });
      // duman
      const f = this.buildings.find(b => b.t === 'factory');
      if (f) {
        const rate = clamp(s.growth, 0, 10) / 10 * 8 + 0.6;
        if (Math.random() < rate * dt) {
          const ch = [f.x + f.w * 0.72, f.x + f.w * 0.88][Math.random() > 0.5 ? 0 : 1];
          this.smoke.push({ x: ch, y: this.gy - this.bHeight(f) - 4, r: 3, ttl: 4, vx: 6 + Math.random() * 6 });
        }
      }
      this.smoke.forEach(p => { p.ttl -= dt; p.y -= 14 * dt; p.x += p.vx * dt; p.r += 6 * dt; });
      this.smoke = this.smoke.filter(p => p.ttl > 0);
      // bulutlar
      this.clouds.forEach(c => { c.x += c.v * dt; if (c.x > 1.15) c.x = -0.15; });
      // yağmur / kar
      const precip = this.rain || this.season === 'kis';
      if (precip && this.drops.length < 120) for (let i = 0; i < 4; i++) this.drops.push({ x: Math.random() * W, y: -10, v: this.season === 'kis' ? 25 + Math.random() * 20 : 220 + Math.random() * 80, drift: (Math.random() - 0.5) * 20 });
      this.drops.forEach(d => { d.y += d.v * dt; d.x += d.drift * dt; });
      this.drops = this.drops.filter(d => d.y < this.H + 10);
      if (!precip) this.drops.length = 0;
      // yüzen yazılar, balon
      this.floaters.forEach(f => { f.ttl -= dt; f.y -= 18 * dt; });
      this.floaters = this.floaters.filter(f => f.ttl > 0);
      if (this.bubble) { this.bubble.ttl -= dt; if (this.bubble.ttl <= 0) this.bubble = null; }
      if (this.priceTag.flash > 0) this.priceTag.flash -= dt;
    }

    // ---------- çizim ----------
    bHeight(b) {
      const s = b.s;
      switch (b.t) { case 'apt': return b.h * s; case 'cb': return 118 * s; case 'meclis': return 96 * s; case 'market': return 62 * s; case 'bank': return 84 * s; case 'factory': return 86 * s; case 'site': return 100 * s; default: return 40 * s; }
    }
    agentY(a) { return this.gy + 6 + a.depth * 14; }

    draw() {
      const ctx = this.ctx, W = this.W, H = this.H, gy = this.gy, s = this.state;
      const night = nightness(this.tod);
      ctx.save();
      if (this.shake > 0) ctx.translate((Math.random() - 0.5) * 8 * this.shake, (Math.random() - 0.5) * 6 * this.shake);
      const [top, bot] = skyColors(this.tod);
      const g = ctx.createLinearGradient(0, 0, 0, gy); g.addColorStop(0, top); g.addColorStop(1, bot);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // yıldızlar
      if (night > 0.2) { ctx.fillStyle = `rgba(255,255,255,${0.8 * night})`; for (let i = 0; i < 40; i++) { const x = hash(i) * W, y = hash(i + 50) * gy * 0.6; const tw = 0.6 + 0.4 * Math.sin(this.time * 2 + i); ctx.globalAlpha = tw * night; ctx.fillRect(x, y, 1.5, 1.5); } ctx.globalAlpha = 1; }
      // güneş / ay
      const ang = (this.tod - 0.25) * TAU; const sx = W / 2 + Math.cos(ang) * W * 0.42, sy = gy - 10 + Math.sin(ang) * (gy - 30);
      if (night < 0.9) { ctx.fillStyle = '#ffd766'; ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 25; ctx.beginPath(); ctx.arc(sx, sy, 16, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; }
      const mx = W / 2 + Math.cos(ang + Math.PI) * W * 0.42, my = gy - 10 + Math.sin(ang + Math.PI) * (gy - 30);
      if (night > 0.1) { ctx.fillStyle = '#f3f1d8'; ctx.beginPath(); ctx.arc(mx, my, 12, 0, TAU); ctx.fill(); ctx.fillStyle = top; ctx.beginPath(); ctx.arc(mx + 5, my - 3, 10, 0, TAU); ctx.fill(); }
      // bulutlar
      this.clouds.forEach(c => { ctx.fillStyle = `rgba(255,255,255,${0.85 - night * 0.6})`; const cx = c.x * W, cy = c.y * gy, r = 14 * c.s; [[0, 0, r], [r * 1.1, -r * 0.3, r * 0.8], [-r * 1.1, -r * 0.1, r * 0.7], [r * 0.4, -r * 0.8, r * 0.7]].forEach(([dx, dy, rr]) => { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, rr, 0, TAU); ctx.fill(); }); });
      if (this.war) { ctx.fillStyle = 'rgba(140,40,20,0.22)'; ctx.fillRect(-10, -10, W + 20, gy + 10); }
      if (this.occupied) { ctx.fillStyle = 'rgba(90,10,10,0.45)'; ctx.fillRect(-10, -10, W + 20, H + 20); }
      // uçaklar
      this.planes.forEach(p => this.drawPlane(p));
      // tepeler
      const hillC = this.season === 'kis' ? '#dfe6ea' : (this.season === 'sonbahar' ? '#b9a06a' : '#8fc27a');
      ctx.fillStyle = mix(hillC.length === 7 ? hillC : '#8fc27a', '#1b2a45', night * 0.6);
      ctx.beginPath(); ctx.moveTo(0, gy); for (let x = 0; x <= W; x += 10) { const y = gy - 28 - 18 * Math.sin(x / 90) - 10 * Math.sin(x / 37 + 2); ctx.lineTo(x, y); } ctx.lineTo(W, gy); ctx.closePath(); ctx.fill();
      // binalar
      this.buildings.forEach((b, i) => { this.drawBuilding(b, night); this.drawDamage(b, i); if (this.occupied && b.t !== 'tree' && i % 2 === 0) this.drawEnemyFlag(b.x + b.w - 8, gy - this.bHeight(b)); });
      // duman
      this.smoke.forEach(p => { ctx.fillStyle = `rgba(120,120,130,${0.35 * p.ttl / 4})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); });
      // zemin: kaldırım + yol
      const groundC = this.season === 'kis' ? '#e9edf0' : '#cfc3b0';
      ctx.fillStyle = mix(groundC, '#2a2a3a', night * 0.55); ctx.fillRect(0, gy, W, 26);
      ctx.fillStyle = mix('#8f9299', '#1e2028', night * 0.6); ctx.fillRect(0, gy + 26, W, 42);
      ctx.fillStyle = mix('#5a5d66', '#15161c', night * 0.6); ctx.fillRect(0, gy + 26, W, 3);
      ctx.strokeStyle = 'rgba(255,230,120,.7)'; ctx.setLineDash([14, 12]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, gy + 47); ctx.lineTo(W, gy + 47); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = mix('#a8b596', '#1b2030', night * 0.6); ctx.fillRect(0, gy + 68, W, H - gy - 68);
      // yanık izleri
      this.scorch.forEach(sc => { ctx.fillStyle = `rgba(30,25,20,${0.55 * sc.a})`; ctx.beginPath(); ctx.ellipse(sc.x, sc.y, 22, 6, 0, 0, TAU); ctx.fill(); });
      // banklar
      this.benches.forEach(bx => { ctx.fillStyle = mix('#8b5a2b', '#2b1d12', night * 0.6); ctx.fillRect(bx - 14, gy + 10, 28, 4); ctx.fillRect(bx - 12, gy + 14, 3, 6); ctx.fillRect(bx + 9, gy + 14, 3, 6); });
      // arabalar (kaldırımın arkasında değil, yolda)
      this.cars.forEach(c => this.drawCar(c, night));
      // vatandaşlar (derinliğe göre)
      this.agents.slice().sort((a, b) => a.depth - b.depth).forEach(a => this.drawAgent(a, night));
      // yangınlar, bombalar, izleyici mermiler, patlamalar
      this.fire.forEach(f => { const fl = 0.7 + Math.random() * 0.5; ctx.fillStyle = `rgba(255,${120 + Math.random() * 80 | 0},30,0.85)`; ctx.beginPath(); ctx.ellipse(f.x, f.y - 6 * fl, 5, 9 * fl, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(80,80,80,0.35)'; ctx.beginPath(); ctx.arc(f.x + Math.sin(this.time * 2 + f.x) * 4, f.y - 22 - (this.time * 10 % 30), 7, 0, TAU); ctx.fill(); });
      this.bombs.forEach(b => { ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 3, 6, Math.atan2(b.vy, b.vx) - Math.PI / 2, 0, TAU); ctx.fill(); ctx.fillStyle = '#b91c1c'; ctx.fillRect(b.x - 1.5, b.y - 8, 3, 3); });
      this.tracers.forEach(t => { ctx.strokeStyle = `rgba(255,230,120,${t.ttl * 2.5})`; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke(); ctx.setLineDash([]); });
      this.explosions.forEach(e => { const k = e.ttl / (e.air ? 0.5 : 0.9); ctx.globalAlpha = Math.min(1, k * 1.4); const g = ctx.createRadialGradient(e.x, e.y, 1, e.x, e.y, e.r); g.addColorStop(0, '#fff7c2'); g.addColorStop(0.35, '#ff9a2e'); g.addColorStop(0.75, e.air ? '#9ca3af' : '#c2410c'); g.addColorStop(1, 'rgba(60,40,30,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill(); if (!e.air) { ctx.fillStyle = `rgba(70,60,55,${0.5 * k})`; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(e.x + Math.cos(i * 1.6) * e.r * 0.6, e.y - e.r * (1 - k) * 1.5 - i * 6, e.r * 0.45, 0, TAU); ctx.fill(); } } ctx.globalAlpha = 1; });
      // yağış
      if (this.drops.length) { ctx.strokeStyle = this.season === 'kis' ? 'rgba(255,255,255,.9)' : 'rgba(180,200,240,.6)'; ctx.lineWidth = this.season === 'kis' ? 2.5 : 1; this.drops.forEach(d => { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + (this.season === 'kis' ? 0 : 1), d.y + (this.season === 'kis' ? 0.1 : 8)); ctx.stroke(); }); }
      // gece karartma
      if (night > 0) { ctx.fillStyle = `rgba(10,15,40,${0.25 * night})`; ctx.fillRect(0, gy, W, H - gy); }
      // yüzen yazılar
      this.floaters.forEach(f => { ctx.globalAlpha = clamp(f.ttl, 0, 1); ctx.font = 'bold 13px Nunito, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1; });
      // konuşma balonu
      if (this.bubble) this.drawBubble(this.bubble);
      // hover vurgusu
      if (this.hover && this.hover.building) { const b = this.hover.building; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(b.x - 2, gy - this.bHeight(b) - 2, b.w + 4, this.bHeight(b) + 4); ctx.setLineDash([]); }
      ctx.restore();
    }

    drawEnemyFlag(x, y) {
      const ctx = this.ctx; ctx.fillStyle = '#222'; ctx.fillRect(x, y - 26, 2, 26);
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(x + 2, y - 26); for (let i = 0; i <= 12; i++) ctx.lineTo(x + 2 + i * 1.4, y - 26 + Math.sin(this.time * 6 + i * 0.6) * 1.2); ctx.lineTo(x + 19, y - 16); ctx.lineTo(x + 2, y - 16); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 3, y - 25, 14, 8);
    }

    drawPlane(p) {
      const ctx = this.ctx; const d = p.dir;
      ctx.fillStyle = '#3a3f4a';
      ctx.beginPath(); ctx.moveTo(p.x + 22 * d, p.y); ctx.lineTo(p.x - 18 * d, p.y - 4); ctx.lineTo(p.x - 22 * d, p.y - 9); ctx.lineTo(p.x - 16 * d, p.y); ctx.lineTo(p.x - 22 * d, p.y + 6); ctx.lineTo(p.x - 16 * d, p.y + 4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(p.x + 2 * d, p.y - 1); ctx.lineTo(p.x - 10 * d, p.y - 14); ctx.lineTo(p.x - 4 * d, p.y - 1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(p.x + 2 * d, p.y + 1); ctx.lineTo(p.x - 10 * d, p.y + 12); ctx.lineTo(p.x - 4 * d, p.y + 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b91c1c'; ctx.fillRect(p.x - 12 * d - 2, p.y - 3, 4, 4);
    }

    drawWindows(b, x, y, w, h, cols, rows, night, activity) {
      const ctx = this.ctx; const cw = w / cols, rh = h / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const lit = night > 0.3 && hash(b.x * 3 + r * 17 + c * 31) < 0.25 + activity * 0.55;
        ctx.fillStyle = lit ? `rgba(255,220,120,${0.6 + 0.4 * night})` : (night > 0.5 ? '#2a3350' : '#b9dcf2');
        ctx.fillRect(x + c * cw + cw * 0.25, y + r * rh + rh * 0.22, cw * 0.5, rh * 0.5);
      }
    }

    drawBuilding(b, night) {
      const ctx = this.ctx, gy = this.gy, s = this.state, sc = b.s; const h = this.bHeight(b); const x = b.x, w = b.w, y = gy - h;
      const activity = s ? clamp((s.growth + 2) / 8, 0.1, 1) : 0.5;
      const dark = c => mix(c, '#1a1f33', night * 0.55);
      ctx.font = `bold ${Math.round(9 * sc)}px Nunito, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      switch (b.t) {
        case 'tree': {
          const tc = this.season === 'kis' ? '#c9d3d8' : (this.season === 'sonbahar' ? '#e0893a' : (this.season === 'ilkbahar' ? '#8fd18a' : '#3f9a4a'));
          ctx.fillStyle = dark('#6b4423'); ctx.fillRect(x + w / 2 - 3, gy - 22, 6, 22);
          ctx.fillStyle = dark(tc); const sway = Math.sin(this.time * 1.5 + x) * 1.5;
          [[0, -30, 14], [-9, -22, 11], [9, -22, 11]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(x + w / 2 + dx + sway, gy + dy, r, 0, TAU); ctx.fill(); });
          break;
        }
        case 'apt': {
          const col = ['#d9b38c', '#c8a9c9', '#a9c5d6', '#e6c07a'][Math.floor(hash(b.x) * 4)];
          ctx.fillStyle = dark(col); ctx.fillRect(x, y, w, h);
          ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x + w - 6, y, 6, h);
          this.drawWindows(b, x + 4, y + 8, w - 8, h - 22, 3, Math.max(2, Math.round(h / 24)), night, activity);
          ctx.fillStyle = dark('#7a5a3a'); ctx.fillRect(x + w / 2 - 6, gy - 14, 12, 14);
          break;
        }
        case 'cb': {
          ctx.fillStyle = dark('#efe6d2'); ctx.fillRect(x, y + 26 * sc, w, h - 26 * sc);
          ctx.fillStyle = dark('#c9b58f'); ctx.beginPath(); ctx.moveTo(x - 4, y + 26 * sc); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w + 4, y + 26 * sc); ctx.closePath(); ctx.fill();
          ctx.fillStyle = dark('#e2d6bc'); for (let i = 0; i < 5; i++) ctx.fillRect(x + 10 * sc + i * (w - 20 * sc) / 4 - 4 * sc, y + 34 * sc, 8 * sc, h - 34 * sc);
          ctx.fillStyle = dark('#3b3b4f'); ctx.fillRect(x + w / 2 - 12 * sc, gy - 26 * sc, 24 * sc, 26 * sc);
          // tabela
          ctx.fillStyle = '#243b6b'; ctx.fillRect(x + w / 2 - 44 * sc, y + 8 * sc, 88 * sc, 16 * sc);
          ctx.fillStyle = '#fff'; ctx.fillText('MERKEZ BANKASI', x + w / 2, y + 16 * sc);
          if (s) { ctx.fillStyle = '#fff'; ctx.fillRect(x + w / 2 - 22 * sc, y + 38 * sc, 44 * sc, 16 * sc); ctx.fillStyle = '#243b6b'; ctx.font = `bold ${Math.round(11 * sc)}px Nunito, system-ui, sans-serif`; ctx.fillText('%' + s.policy.rate.toFixed(2).replace('.', ','), x + w / 2, y + 46 * sc); }
          break;
        }
        case 'meclis': {
          ctx.fillStyle = dark('#d8d2c4'); ctx.fillRect(x, y + 20 * sc, w, h - 20 * sc);
          ctx.fillStyle = dark('#b8b0a0'); ctx.fillRect(x + w / 2 - 30 * sc, y, 60 * sc, 22 * sc);
          ctx.fillStyle = dark('#efe9dc'); for (let i = 0; i < 7; i++) ctx.fillRect(x + 8 * sc + i * (w - 16 * sc) / 6 - 3 * sc, y + 30 * sc, 6 * sc, h - 34 * sc);
          ctx.fillStyle = dark('#4a3b30'); ctx.fillRect(x + w / 2 - 10 * sc, gy - 22 * sc, 20 * sc, 22 * sc);
          ctx.fillStyle = '#5b3a2e'; ctx.fillRect(x + w / 2 - 36 * sc, y + 4 * sc, 72 * sc, 12 * sc); ctx.fillStyle = '#fff'; ctx.fillText('MECLİS', x + w / 2, y + 10 * sc);
          if (this.war && this.war.mobilized) { ctx.fillStyle = '#b91c1c'; ctx.fillRect(x + w / 2 - 44 * sc, y + 24 * sc, 88 * sc, 12 * sc); ctx.fillStyle = '#fff'; ctx.fillText('SEFERBERLİK', x + w / 2, y + 30 * sc); }
          // bayrak
          const fx = x + w - 10 * sc, fy = y - 30 * sc; ctx.fillStyle = dark('#888'); ctx.fillRect(fx, fy, 2, 30 * sc + 20 * sc);
          ctx.fillStyle = '#d7263d'; ctx.beginPath(); ctx.moveTo(fx + 2, fy); for (let i = 0; i <= 20; i++) { const px = fx + 2 + i * 1.1 * sc, py = fy + Math.sin(this.time * 6 + i * 0.5) * 1.5; ctx.lineTo(px, py); } ctx.lineTo(fx + 24 * sc, fy + 14 * sc); ctx.lineTo(fx + 2, fy + 14 * sc); ctx.closePath(); ctx.fill();
          break;
        }
        case 'market': {
          ctx.fillStyle = dark('#f2d38b'); ctx.fillRect(x, y, w, h);
          ctx.fillStyle = dark('#d7263d'); for (let i = 0; i < Math.floor(w / 12); i++) { ctx.fillStyle = i % 2 ? dark('#d7263d') : dark('#fff'); ctx.beginPath(); ctx.moveTo(x + i * 12, y + 22 * sc); ctx.lineTo(x + i * 12 + 12, y + 22 * sc); ctx.lineTo(x + i * 12 + 6, y + 32 * sc); ctx.closePath(); ctx.fill(); }
          ctx.fillStyle = night > 0.5 ? '#ffe9a8' : '#bfe3f5'; ctx.fillRect(x + 8, y + 36 * sc, w - 16, h - 42 * sc);
          ctx.fillStyle = '#2e7d32'; ctx.fillRect(x + w / 2 - 28 * sc, y + 4 * sc, 56 * sc, 14 * sc); ctx.fillStyle = '#fff'; ctx.fillText('MARKET', x + w / 2, y + 11 * sc);
          if (s) {
            const price = s.breadPrice; const txt = 'EKMEK ₺' + (price >= 100 ? price.toFixed(0) : price.toFixed(2).replace('.', ','));
            const flash = this.priceTag.flash > 0 && Math.sin(this.time * 10) > 0;
            ctx.fillStyle = flash ? '#d7263d' : '#fff'; ctx.fillRect(x + w / 2 - 30 * sc, y + 42 * sc, 60 * sc, 14 * sc);
            ctx.fillStyle = flash ? '#fff' : '#2b2b2b'; ctx.font = `bold ${Math.round(9 * sc)}px Nunito, system-ui, sans-serif`; ctx.fillText(txt, x + w / 2, y + 49 * sc);
            if (this.priceTag.flash > 0) { ctx.fillStyle = '#d7263d'; ctx.font = `bold ${Math.round(11 * sc)}px Nunito, system-ui, sans-serif`; ctx.fillText('ZAM!', x + w - 14 * sc, y - 8 + Math.sin(this.time * 8) * 3); }
          }
          break;
        }
        case 'bank': {
          ctx.fillStyle = dark('#9fb4c7'); ctx.fillRect(x, y, w, h);
          ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x, y, w, 4);
          this.drawWindows(b, x + 4, y + 20 * sc, w - 8, h - 36 * sc, 4, 3, night, activity);
          ctx.fillStyle = '#1e3a5f'; ctx.fillRect(x + w / 2 - 24 * sc, y + 4 * sc, 48 * sc, 12 * sc); ctx.fillStyle = '#fff'; ctx.fillText('BANKA', x + w / 2, y + 10 * sc);
          ctx.fillStyle = dark('#2b3a4a'); ctx.fillRect(x + w / 2 - 8 * sc, gy - 16 * sc, 16 * sc, 16 * sc);
          break;
        }
        case 'factory': {
          ctx.fillStyle = dark('#b56b4a'); ctx.fillRect(x, y + 26 * sc, w * 0.62, h - 26 * sc);
          // testere çatı
          ctx.fillStyle = dark('#8e4f36'); for (let i = 0; i < 3; i++) { const sx0 = x + i * w * 0.62 / 3; ctx.beginPath(); ctx.moveTo(sx0, y + 26 * sc); ctx.lineTo(sx0 + w * 0.62 / 3, y + 6 * sc); ctx.lineTo(sx0 + w * 0.62 / 3, y + 26 * sc); ctx.closePath(); ctx.fill(); }
          ctx.fillStyle = dark('#8a8a8a'); ctx.fillRect(x + w * 0.62, y + 40 * sc, w * 0.38, h - 40 * sc);
          ctx.fillStyle = dark('#6e6e6e'); ctx.fillRect(x + w * 0.72 - 5, y - 4, 10, 44 * sc); ctx.fillRect(x + w * 0.88 - 5, y + 4, 10, 36 * sc);
          this.drawWindows(b, x + 4, y + 34 * sc, w * 0.58, h - 48 * sc, 4, 2, night, activity);
          ctx.fillStyle = '#5a3a2a'; ctx.fillRect(x + 6, y + 30 * sc, 56 * sc, 12 * sc); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText('FABRİKA', x + 10, y + 36 * sc); ctx.textAlign = 'center';
          break;
        }
        case 'site': {
          const active = s && (s.policy.invest >= 6 || s.programs.konut);
          const prog = s ? clamp((s.policy.invest - 4) / 6, 0.15, 1) : 0.3;
          const bh = h * prog;
          ctx.fillStyle = dark('#c5b7a3'); ctx.fillRect(x, gy - bh, w * 0.7, bh);
          ctx.strokeStyle = dark('#8a7a66'); ctx.lineWidth = 1; for (let yy = gy - bh + 10; yy < gy; yy += 14) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w * 0.7, yy); ctx.stroke(); }
          // vinç
          const cx = x + w * 0.82; ctx.fillStyle = dark('#e0a92e'); ctx.fillRect(cx - 3, y, 6, h);
          const swing = active ? Math.sin(this.time * 0.8) * 12 : 0;
          ctx.fillRect(cx - 40 * sc + swing, y - 2, 60 * sc, 4);
          const hookX = cx - 30 * sc + swing, hookY = y + (active ? 30 + Math.sin(this.time * 1.3) * 20 : 30);
          ctx.strokeStyle = dark('#555'); ctx.beginPath(); ctx.moveTo(hookX, y + 2); ctx.lineTo(hookX, hookY); ctx.stroke();
          ctx.fillStyle = dark('#8d6e63'); ctx.fillRect(hookX - 6, hookY, 12, 8);
          ctx.fillStyle = '#e0a92e'; ctx.fillRect(x, gy - bh - 14, 54 * sc, 12); ctx.fillStyle = '#2b2b2b'; ctx.fillText(active ? 'İNŞAAT' : 'DURDU', x + 27 * sc, gy - bh - 8);
          break;
        }
      }
    }

    drawDamage(b, i) {
      const d = this.damage[i]; if (!d) return; const ctx = this.ctx, gy = this.gy, h = this.bHeight(b), x = b.x, w = b.w, y = gy - h;
      ctx.strokeStyle = 'rgba(20,15,10,0.75)'; ctx.lineWidth = 1.5;
      for (let k = 0; k < d * 2; k++) { const sx = x + hash(i * 7 + k) * w, sy = y + hash(i * 13 + k) * h * 0.8; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 6, sy + 10); ctx.lineTo(sx + 2, sy + 18); ctx.lineTo(sx + 9, sy + 27); ctx.stroke(); }
      ctx.fillStyle = `rgba(40,35,30,${0.15 * d})`; ctx.fillRect(x, y, w, h);
      if (d >= 3) { ctx.fillStyle = '#e0a92e'; ctx.font = 'bold 8px Nunito, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('HASARLI', x + w / 2, y - 6); }
    }

    drawCar(c, night) {
      const ctx = this.ctx; const y = this.gy + 30 + c.lane * 20; const w = 30, h = 12;
      if (c.tank) { ctx.fillStyle = mix('#4b6b3a', '#111', night * 0.4); ctx.fillRect(c.x - 18, y - 2, 36, 12); ctx.fillRect(c.x - 9, y - 10, 16, 8); ctx.fillRect(c.x + (c.dir > 0 ? 7 : -25), y - 7, 18, 2.5); ctx.fillStyle = '#222'; ctx.fillRect(c.x - 19, y + 8, 38, 5); for (let k = -14; k <= 14; k += 7) { ctx.beginPath(); ctx.arc(c.x + k, y + 10, 3, 0, TAU); ctx.fill(); } return; }
      ctx.fillStyle = mix(c.color, '#111', night * 0.4); ctx.fillRect(c.x - w / 2, y, w, h);
      ctx.fillRect(c.x - w / 4, y - 6, w / 2, 6);
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(c.x - 9, y + h, 4, 0, TAU); ctx.arc(c.x + 9, y + h, 4, 0, TAU); ctx.fill();
      if (night > 0.3) { ctx.fillStyle = `rgba(255,240,180,${night})`; ctx.fillRect(c.x + (c.dir > 0 ? w / 2 - 2 : -w / 2), y + 3, 2, 4); }
    }

    drawAgent(a, night) {
      const ctx = this.ctx; const y = this.agentY(a); const x = a.x; const walking = (a.state === 'walk' && a.idle <= 0) || a.marching || (a.state === 'sit' && !a.seated);
      const swing = walking ? Math.sin(a.phase) * 4 : 0;
      const bob = walking ? Math.abs(Math.sin(a.phase)) * 1.2 : (a.state === 'protest' ? Math.abs(Math.sin(this.time * 6 + a.id)) * 2 : 0);
      const seated = a.state === 'sit' && a.seated;
      const by = y - bob - (seated ? 4 : 0);
      const dark = c => mix(c, '#1a1f33', night * 0.4);
      // bacaklar
      ctx.strokeStyle = dark('#3a3a4a'); ctx.lineWidth = 2.5;
      if (seated) { ctx.beginPath(); ctx.moveTo(x - 3, by - 8); ctx.lineTo(x - 3 + a.dir * 6, by - 4); ctx.lineTo(x - 3 + a.dir * 6, by); ctx.moveTo(x + 2, by - 8); ctx.lineTo(x + 2 + a.dir * 6, by - 4); ctx.lineTo(x + 2 + a.dir * 6, by); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(x - 2, by - 9); ctx.lineTo(x - 2 + swing, by); ctx.moveTo(x + 2, by - 9); ctx.lineTo(x + 2 - swing, by); ctx.stroke(); }
      // gövde
      ctx.fillStyle = dark(a.soldier ? '#4b6b3a' : a.seg === 'esnaf' ? '#2f3a55' : a.color);
      roundRect(ctx, x - 5, by - 20, 10, 12, 3); ctx.fill();
      if (a.seg === 'esnaf') { ctx.fillStyle = '#d7263d'; ctx.fillRect(x - 1, by - 19, 2, 8); }
      if (a.seg === 'genc') { ctx.fillStyle = dark('#444'); ctx.fillRect(x - a.dir * 7, by - 19, 4, 9); }
      if (a.seg === 'memur') { ctx.fillStyle = dark('#4a2f1a'); ctx.fillRect(x + a.dir * 6, by - 12, 5, 6); }
      if (a.seg === 'emekli') { ctx.strokeStyle = dark('#7a4a1a'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + a.dir * 7, by - 12); ctx.lineTo(x + a.dir * 8, by); ctx.stroke(); }
      // kafa
      const hy = by - 26;
      ctx.fillStyle = a.skin; ctx.beginPath(); ctx.arc(x, hy, 5.5, 0, TAU); ctx.fill();
      // saç / şapka
      if (a.soldier) { ctx.fillStyle = '#4b6b3a'; ctx.beginPath(); ctx.arc(x, hy - 1, 6.2, Math.PI, TAU); ctx.fill(); ctx.fillRect(x - 7, hy - 1, 14, 2); }
      switch (a.soldier ? 'asker' : a.seg) {
        case 'isci': ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(x, hy - 1, 6, Math.PI, TAU); ctx.fill(); ctx.fillRect(x - 7, hy - 1, 14, 2); break;
        case 'emekli': ctx.fillStyle = '#d9d9d9'; ctx.beginPath(); ctx.arc(x, hy - 2, 5.5, Math.PI, TAU); ctx.fill(); break;
        case 'ciftci': ctx.fillStyle = '#d9b45a'; ctx.fillRect(x - 9, hy - 3, 18, 2); ctx.beginPath(); ctx.arc(x, hy - 3, 5, Math.PI, TAU); ctx.fill(); break;
        case 'genc': ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(x, hy - 2, 5.5, Math.PI, TAU); ctx.fill(); ctx.fillRect(x, hy - 3, a.dir * 8, 2); break;
        case 'memur': ctx.fillStyle = '#4a3222'; ctx.beginPath(); ctx.arc(x, hy - 2, 5.5, Math.PI, TAU); ctx.fill(); break;
        default: ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(x, hy - 2, 5.5, Math.PI, TAU); ctx.fill();
      }
      // yüz
      ctx.fillStyle = '#222'; ctx.fillRect(x - 2.5 + a.dir, hy - 1, 1.3, 1.3); ctx.fillRect(x + 1.2 + a.dir, hy - 1, 1.3, 1.3);
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.beginPath();
      const m = a.mood; const mouthY = hy + 2.5;
      if (m > 60) ctx.arc(x + a.dir * 0.5, mouthY - 0.5, 2, 0.15 * Math.PI, 0.85 * Math.PI);
      else if (m < 40) ctx.arc(x + a.dir * 0.5, mouthY + 2, 2, 1.15 * Math.PI, 1.85 * Math.PI);
      else { ctx.moveTo(x - 1.5 + a.dir * 0.5, mouthY); ctx.lineTo(x + 1.5 + a.dir * 0.5, mouthY); }
      ctx.stroke();
      if (m < 30) { ctx.strokeStyle = '#a33'; ctx.beginPath(); ctx.moveTo(x - 3.5 + a.dir, hy - 3.5); ctx.lineTo(x - 1 + a.dir, hy - 2.5); ctx.moveTo(x + 3.5 + a.dir, hy - 3.5); ctx.lineTo(x + 1 + a.dir, hy - 2.5); ctx.stroke(); }
      // pankart
      if (a.state === 'protest' && !a.marching) {
        const px = x + a.dir * 9, py = by - 20 - Math.abs(Math.sin(this.time * 5 + a.id)) * 3;
        ctx.strokeStyle = dark('#7a5a3a'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py + 2); ctx.lineTo(px, by - 12); ctx.stroke();
        ctx.font = 'bold 7px Nunito, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(a.sign).width + 8;
        ctx.fillStyle = '#fff8e6'; ctx.fillRect(px - tw / 2, py - 12, tw, 12); ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 1; ctx.strokeRect(px - tw / 2, py - 12, tw, 12);
        ctx.fillStyle = '#b3261e'; ctx.fillText(a.sign, px, py - 6);
      }
      // duygu balonu
      if (a.emote) { const t = clamp(a.emote.ttl, 0, 1); ctx.globalAlpha = t; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 8, hy - 14, 8, 0, TAU); ctx.fill(); ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText(a.emote.t, x + 8, hy - 13.5); ctx.globalAlpha = 1; }
      // hover halkası
      if (this.hover && this.hover.agent === a) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y + 1, 10, 4, 0, 0, TAU); ctx.stroke(); }
    }

    drawBubble(b) {
      const ctx = this.ctx, a = b.agent; const x = a.x, y = this.agentY(a) - 36;
      ctx.font = '12px Nunito, system-ui, sans-serif'; const words = b.text.split(' '); const lines = []; let cur = '';
      words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > 170) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur);
      const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 18, bh = lines.length * 15 + 12;
      let bx = clamp(x - bw / 2, 4, this.W - bw - 4); const by = y - bh - 8;
      ctx.globalAlpha = clamp(b.ttl * 2, 0, 1);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#5a4634'; ctx.lineWidth = 1.5; roundRect(ctx, bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 5, by + bh - 1); ctx.lineTo(x, by + bh + 7); ctx.lineTo(x + 5, by + bh - 1); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(x - 5, by + bh - 2, 10, 3);
      ctx.fillStyle = '#2b2118'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      lines.forEach((l, i) => ctx.fillText(l, bx + 9, by + 7 + i * 15));
      ctx.globalAlpha = 1;
    }
  }

  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  global.City = City;
})(typeof window !== 'undefined' ? window : globalThis);
