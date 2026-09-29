/* ===========================================================
   ÜLKEYİ YÖNET — Ses efektleri (WebAudio ile sentez, dosya yok)
   =========================================================== */
(function (global) {
  'use strict';
  const KEY = 'ulkeyiYonetMuted';
  const S = { ctx: null, master: null, muted: false, ready: false };
  try { S.muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* yoksay */ }

  function init() {
    if (S.ready) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    S.ctx = new AC();
    S.master = S.ctx.createGain();
    S.master.gain.value = S.muted ? 0 : 0.5;
    S.master.connect(S.ctx.destination);
    S.ready = true;
    return true;
  }
  function resume() { if (S.ctx && S.ctx.state === 'suspended') S.ctx.resume(); }
  // İlk kullanıcı etkileşiminde ses bağlamını aç
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { init(); resume(); }, { passive: true }));

  function now() { return S.ctx.currentTime; }

  /** Tek ton: freq (Hz), dur (sn), type, vol, opsiyonel bitiş frekansı ve gecikme */
  function tone(freq, dur, type, vol, opts) {
    if (!S.ready || S.muted) return;
    opts = opts || {};
    const t0 = now() + (opts.delay || 0);
    const o = S.ctx.createOscillator(), g = S.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + (opts.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(S.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  /** Gürültü: dur (sn), band-pass frekansı, vol */
  function noise(dur, freq, vol, opts) {
    if (!S.ready || S.muted) return;
    opts = opts || {};
    const t0 = now() + (opts.delay || 0);
    const n = Math.floor(S.ctx.sampleRate * dur);
    const buf = S.ctx.createBuffer(1, n, S.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = S.ctx.createBufferSource(); src.buffer = buf;
    const f = S.ctx.createBiquadFilter(); f.type = opts.type || 'bandpass'; f.frequency.value = freq; f.Q.value = opts.q || 0.8;
    const g = S.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + (opts.attack || 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(S.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }
  const seq = (notes, dur, type, vol, gap) => notes.forEach((f, i) => tone(f, dur, type, vol, { delay: i * (gap || dur * 0.8) }));

  const FX = {
    click: () => tone(1400, 0.05, 'sine', 0.12, { to: 900 }),
    tick: () => { tone(520, 0.09, 'triangle', 0.18, { to: 780 }); noise(0.18, 2500, 0.08, { delay: 0.02 }); },
    quarter: () => { seq([523, 659, 784], 0.14, 'triangle', 0.16, 0.09); noise(0.3, 3000, 0.06); },
    rateUp: () => seq([440, 554, 659, 880], 0.12, 'square', 0.07, 0.07),
    rateDown: () => seq([880, 659, 554, 440], 0.12, 'square', 0.07, 0.07),
    good: () => seq([523, 659, 784, 1047], 0.22, 'sine', 0.16, 0.08),
    bad: () => { tone(160, 0.35, 'sawtooth', 0.12, { to: 90 }); tone(120, 0.4, 'square', 0.06, { to: 70 }); },
    event: () => { tone(880, 0.25, 'triangle', 0.18); tone(660, 0.35, 'triangle', 0.18, { delay: 0.22 }); noise(0.4, 1800, 0.05, { delay: 0.05 }); },
    report: () => { noise(0.35, 1200, 0.12, { q: 0.5 }); tone(1046, 0.3, 'sine', 0.1, { delay: 0.25 }); tone(1318, 0.35, 'sine', 0.08, { delay: 0.4 }); },
    coin: () => { tone(1760, 0.08, 'square', 0.08); tone(2350, 0.18, 'square', 0.08, { delay: 0.07 }); },
    switchOn: () => { tone(600, 0.06, 'square', 0.08); tone(900, 0.1, 'square', 0.08, { delay: 0.06 }); },
    switchOff: () => { tone(900, 0.06, 'square', 0.08); tone(600, 0.1, 'square', 0.08, { delay: 0.06 }); },
    pop: () => tone(700, 0.08, 'sine', 0.14, { to: 1100 }),
    crowd: () => { noise(1.4, 350, 0.18, { q: 0.6, attack: 0.5 }); noise(1.2, 900, 0.08, { q: 0.7, attack: 0.4, delay: 0.2 }); tone(220, 0.8, 'sawtooth', 0.03, { to: 180, delay: 0.3 }); },
    fx: () => { noise(0.5, 4000, 0.07, { attack: 0.05 }); seq([988, 1318], 0.12, 'triangle', 0.1, 0.1); },
    win: () => { seq([523, 659, 784, 1047, 1319], 0.26, 'triangle', 0.18, 0.13); seq([262, 330, 392, 523, 659], 0.26, 'sine', 0.12, 0.13); noise(0.6, 5000, 0.05, { delay: 0.6 }); },
    lose: () => { seq([440, 392, 349, 294, 220], 0.4, 'sawtooth', 0.08, 0.28); tone(110, 1.2, 'square', 0.05, { to: 60, delay: 1.2 }); },
    alarm: () => { seq([880, 660, 880, 660], 0.14, 'square', 0.07, 0.14); },
  };

  function play(name) {
    if (!S.ready) { if (!init()) return; }
    resume();
    const f = FX[name]; if (f) { try { f(); } catch (e) { /* yoksay */ } }
  }
  function setMuted(m) {
    S.muted = !!m;
    try { localStorage.setItem(KEY, S.muted ? '1' : '0'); } catch (e) { /* yoksay */ }
    if (S.master) S.master.gain.setTargetAtTime(S.muted ? 0 : 0.5, S.ctx.currentTime, 0.02);
  }
  function toggle() { setMuted(!S.muted); if (!S.muted) play('click'); return S.muted; }

  global.Sound = { play, setMuted, toggle, isMuted: () => S.muted, init };
})(typeof window !== 'undefined' ? window : globalThis);
