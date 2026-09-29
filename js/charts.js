/* Basit canvas grafikleri: sparkline ve çok serili çizgi grafik */
(function (global) {
  'use strict';

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function sparkline(canvas, data, color, opts) {
    opts = opts || {};
    const { ctx, w, h } = setup(canvas);
    if (!data || data.length < 2) { return; }
    const pad = 3;
    let min = Math.min(...data), max = Math.max(...data);
    if (opts.target !== undefined) { min = Math.min(min, opts.target); max = Math.max(max, opts.target); }
    if (max - min < 1e-6) { max += 1; min -= 1; }
    const range = max - min;
    const x = i => pad + (w - 2 * pad) * i / (data.length - 1);
    const y = v => h - pad - (h - 2 * pad) * (v - min) / range;
    // hedef çizgisi
    if (opts.target !== undefined) {
      ctx.strokeStyle = 'rgba(120,120,120,.45)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad, y(opts.target)); ctx.lineTo(w - pad, y(opts.target)); ctx.stroke(); ctx.setLineDash([]);
    }
    // alan
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '55'); grad.addColorStop(1, color + '05');
    ctx.beginPath(); ctx.moveTo(x(0), h - pad);
    data.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(x(data.length - 1), h - pad); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    // çizgi
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    data.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.stroke();
    // son nokta
    const lx = x(data.length - 1), ly = y(data[data.length - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2); ctx.fillStyle = color + '33'; ctx.fill();
  }

  /**
   * series: [{name, data:[], color, dash}] ; labels: [] ; opts: {target, unit, textColor, grid}
   */
  function lineChart(canvas, series, labels, opts) {
    opts = opts || {};
    const { ctx, w, h } = setup(canvas);
    const padL = 42, padR = 12, padT = 14, padB = 24;
    const all = [];
    series.forEach(s => s.data.forEach(v => { if (isFinite(v)) all.push(v); }));
    if (opts.target !== undefined) all.push(opts.target);
    if (!all.length) return;
    let min = Math.min(...all), max = Math.max(...all);
    if (max - min < 1e-6) { max += 1; min -= 1; }
    const span = max - min; min -= span * 0.08; max += span * 0.08;
    const n = Math.max(2, labels.length);
    const x = i => padL + (w - padL - padR) * i / (n - 1);
    const y = v => padT + (h - padT - padB) * (1 - (v - min) / (max - min));
    const textColor = opts.textColor || 'rgba(90,80,70,.8)';
    const gridColor = opts.gridColor || 'rgba(120,110,100,.15)';
    // ızgara
    ctx.font = '11px Nunito, system-ui, sans-serif'; ctx.fillStyle = textColor; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const v = min + (max - min) * t / ticks, yy = y(v);
      ctx.strokeStyle = gridColor; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
      ctx.fillText(fmt(v, opts.unit), padL - 6, yy);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const stepL = Math.ceil(n / 8);
    labels.forEach((l, i) => { if (i % stepL === 0 || i === n - 1) ctx.fillText(l, x(i), h - padB + 6); });
    if (opts.target !== undefined) {
      ctx.strokeStyle = 'rgba(200,60,60,.6)'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(padL, y(opts.target)); ctx.lineTo(w - padR, y(opts.target)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(200,60,60,.9)'; ctx.textAlign = 'left'; ctx.fillText('hedef', padL + 4, y(opts.target) - 13);
    }
    series.forEach(s => {
      ctx.beginPath(); ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2.2; ctx.lineJoin = 'round';
      if (s.dash) ctx.setLineDash(s.dash);
      let started = false;
      s.data.forEach((v, i) => { if (!isFinite(v)) return; if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v)); });
      ctx.stroke(); ctx.setLineDash([]);
      const li = s.data.length - 1;
      if (li >= 0 && isFinite(s.data[li])) { ctx.beginPath(); ctx.arc(x(li), y(s.data[li]), 3.5, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill(); }
    });
    // lejant
    let lx = padL + 4;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    series.forEach(s => {
      ctx.fillStyle = s.color; ctx.fillRect(lx, padT - 10, 12, 3); ctx.fillStyle = textColor; ctx.fillText(s.name, lx + 16, padT - 9);
      lx += 16 + ctx.measureText(s.name).width + 14;
    });
  }

  function fmt(v, unit) {
    const a = Math.abs(v);
    const s = a >= 100 ? v.toFixed(0) : (a >= 10 ? v.toFixed(1) : v.toFixed(2));
    return unit === '%' ? '%' + s : s;
  }

  // Yarım daire gösterge (destek/öfke)
  function gauge(canvas, value, color, opts) {
    const { ctx, w, h } = setup(canvas);
    const cx = w / 2, cy = h - 6, r = Math.min(w / 2 - 6, h - 10);
    ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(120,110,100,.18)'; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * Math.max(0.005, value / 100)); ctx.stroke();
    ctx.fillStyle = opts && opts.textColor || '#3a3028'; ctx.font = 'bold 20px Nunito, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(Math.round(value), cx, cy - 2);
  }

  global.Charts = { sparkline, lineChart, gauge };
})(typeof window !== 'undefined' ? window : globalThis);
