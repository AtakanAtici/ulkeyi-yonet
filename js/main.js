/* ===========================================================
   ÜLKEYİ YÖNET — Ana oyun döngüsü ve arayüz
   =========================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const fmtN = (v, dec) => v.toLocaleString('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const SAVE_KEY = 'ulkeyiYonetSave_v1';
  const LB_KEY = 'ulkeyiYonetScores_v1', NAME_KEY = 'ulkeyiYonetName';

  const INDICATORS = [
    { key: 'infl', label: 'Manşet Enflasyon', unit: '%', dec: 1, color: '#d9534f', good: 'down', target: s => s.target, bar: [0, 60] },
    { key: 'core', label: 'Çekirdek Enflasyon', unit: '%', dec: 1, color: '#e08e3c', good: 'down', bar: [0, 60] },
    { key: 'exp', label: 'Enflasyon Beklentisi', unit: '%', dec: 1, color: '#c47ad1', good: 'down', bar: [0, 60] },
    { key: 'growth', label: 'Büyüme', unit: '%', dec: 1, color: '#3c9d5d', good: 'up', bar: [8, -6] },
    { key: 'unemp', label: 'İşsizlik', unit: '%', dec: 1, color: '#b8862b', good: 'down', bar: [4, 18] },
    { key: 'fx', label: 'USD/TRY', unit: '', dec: 2, color: '#3b6fb6', good: 'down' },
    { key: 'reserves', label: 'Rezervler', unit: ' mlr $', dec: 1, color: '#2a9d8f', good: 'up', bar: [250, 0] },
    { key: 'cds', label: 'CDS Primi', unit: ' bp', dec: 0, color: '#8d5524', good: 'down', bar: [100, 900] },
    { key: 'debt', label: 'Borç / GSYH', unit: '%', dec: 1, color: '#6c757d', good: 'down', bar: [20, 100] },
    { key: 'deficit', label: 'Bütçe Açığı', unit: '% GSYH', dec: 1, color: '#a05a2c', good: 'down', bar: [-2, 12] },
    { key: 'ca', label: 'Cari Denge', unit: '% GSYH', dec: 1, color: '#5b8def', good: 'up', bar: [3, -8] },
    { key: 'cred', label: 'Güvenilirlik', unit: '/100', dec: 0, color: '#7c5cbf', good: 'up', bar: [100, 0] },
  ];
  const CHART_SETS = {
    infl: { name: 'Enflasyon', series: [['infl', 'Manşet', '#d9534f'], ['core', 'Çekirdek', '#e08e3c'], ['exp', 'Beklenti', '#c47ad1'], ['rate', 'Politika faizi', '#3b6fb6', [4, 3]]], unit: '%', target: s => s.target },
    growth: { name: 'Büyüme & İşsizlik', series: [['growth', 'Büyüme', '#3c9d5d'], ['unemp', 'İşsizlik', '#b8862b']], unit: '%' },
    fx: { name: 'Kur', series: [['fx', 'USD/TRY', '#3b6fb6']], unit: '' },
    reserves: { name: 'Rezerv & CDS', series: [['reserves', 'Rezerv (mlr $)', '#2a9d8f'], ['cds', 'CDS (bp)', '#8d5524']], unit: '' },
    fiscal: { name: 'Bütçe', series: [['debt', 'Borç/GSYH', '#6c757d'], ['deficit', 'Açık', '#a05a2c']], unit: '%' },
    people: { name: 'Halk', series: [['support', 'Destek', '#2e8b57'], ['cred', 'Güvenilirlik', '#7c5cbf']], unit: '' },
  };
  const FACES = m => m >= 75 ? '😄' : m >= 60 ? '🙂' : m >= 45 ? '😐' : m >= 30 ? '😟' : '😡';
  const SEG_ICON = { isci: '👷', emekli: '👴', esnaf: '👔', ciftci: '👩‍🌾', memur: '🧑‍💼', genc: '🧑‍🎓' };

  const G = { state: null, rng: null, city: null, auto: null, chart: 'infl', busy: false, selectedInd: 'infl', lastReportTurn: 0, prevVals: {} };

  // ============ Başlangıç ============
  function init() {
    G.city = new City($('city'), { onBuildingClick: onBuildingClick, onHover: onCityHover, onAgentClick: onAgentClick });
    bindUI();
    const saved = load();
    if (saved) showContinueModal(saved); else showStartModal();
  }

  function newGame(scenarioId, diff) {
    G.state = Model.createState(scenarioId, diff);
    G.rng = Model.makeRng(G.state.seed);
    G.lastReportTurn = 0; G.prevVals = {};
    G.city.setState(G.state, { newMonth: true });
    buildPolicyTabs();
    renderAll(true);
    save();
    showTutorial(0);
  }

  // ============ UI bağlama ============
  function bindUI() {
    $('btnMonth').addEventListener('click', () => advance(1));
    $('btnQuarter').addEventListener('click', () => advance(3 - ((G.state.turn) % 3) || 3));
    $('btnAuto').addEventListener('click', toggleAuto);
    $('btnMenu').addEventListener('click', showMenu);
    $('mbMonth').addEventListener('click', () => advance(1));
    $('mbQuarter').addEventListener('click', () => advance(3 - ((G.state.turn) % 3) || 3));
    $('mbAuto').addEventListener('click', toggleAuto);
    $('mbMenu').addEventListener('click', showMenu);
    $('btnSound').addEventListener('click', () => { const muted = Sound.toggle(); $('btnSound').textContent = muted ? '🔇' : '🔊'; $('btnSound').classList.toggle('on', !muted); });
    $('btnSound').textContent = Sound.isMuted() ? '🔇' : '🔊'; $('btnSound').classList.toggle('on', !Sound.isMuted());
    $('policyTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) selectTab(b.dataset.tab); });
    document.addEventListener('keydown', e => {
      const typing = e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type !== 'range');
      const modalOpen = !$('modal').classList.contains('hidden');
      // Enter: açık pencerede ana düğmeyi tetikle (Devam, İleri, Kararı Açıkla, Göreve Başla)
      if (e.key === 'Enter' && !e.shiftKey && modalOpen) {
        if (typing && e.target.id === 'nameInput') { e.target.blur(); e.preventDefault(); return; }
        const primary = $('modalCard').querySelector('.modal-foot .btn.primary');
        if (primary) { e.preventDefault(); primary.click(); }
        return;
      }
      if (!G.state || G.state.gameOver || modalOpen || typing) return;
      if (e.code === 'Space' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); advance(1); }
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); advance(3 - (G.state.turn % 3) || 3); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPolicy('rate', G.state.policy.rate + 1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setPolicy('rate', G.state.policy.rate - 1); }
    });
    Object.keys(CHART_SETS).forEach(k => { const b = document.createElement('button'); b.textContent = CHART_SETS[k].name; b.dataset.k = k; b.addEventListener('click', () => { G.chart = k; renderChart(); }); $('chartTabs').appendChild(b); });
    window.addEventListener('resize', () => { if (G.state) { renderChart(); renderIndicators(false); } });
  }

  function selectTab(t) {
    document.querySelectorAll('#policyTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    ['para', 'maliye', 'program'].forEach(k => $('tab-' + k).classList.toggle('hidden', k !== t));
  }
  function onBuildingClick(type) {
    const map = { cb: 'para', bank: 'para', meclis: 'maliye', market: 'program', factory: 'program', site: 'maliye' };
    const t = map[type]; if (!t) return;
    selectTab(t);
    const b = document.querySelector(`#policyTabs button[data-tab=${t}]`); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
    const msgs = { cb: 'Merkez Bankası: politika faizi ve likidite araçları', bank: 'Bankalar: kredi koşulları ve zorunlu karşılıklar', meclis: 'Meclis: vergi ve harcama kararları', market: 'Market: fiyatları etkileyen programlar', factory: 'Fabrika: istihdam ve yatırım programları', site: 'İnşaat: kamu yatırım harcamaları' };
    toast(msgs[type]);
  }
  function onCityHover(h, p) {
    const tip = $('cityTip');
    clearTimeout(G.tipTimer);
    if (!h) { tip.classList.add('hidden'); return; }
    if (p && p.touch) G.tipTimer = setTimeout(() => tip.classList.add('hidden'), 2200);
    const names = { cb: 'Merkez Bankası', meclis: 'Meclis', market: 'Market', bank: 'Banka', factory: 'Fabrika', site: 'Şantiye', apt: 'Konutlar' };
    tip.textContent = h.agent ? `${SEG_ICON[h.agent.seg]} ${Model.SEGMENTS.find(s => s.id === h.agent.seg).name} · ${h.agent.state === 'protest' ? 'protestoda' : h.agent.state === 'sit' ? 'işsiz' : FACES(h.agent.mood)}` : names[h.building.t];
    tip.style.left = p.x + 'px'; tip.style.top = p.y + 'px'; tip.classList.remove('hidden');
  }
  function onAgentClick(a, q) {
    Sound.play('pop');
    const seg = Model.SEGMENTS.find(s => s.id === a.seg);
    addVoice(seg, q, true);
  }

  // ============ Politika paneli ============
  function slider(o) {
    return `<div class="ctl" data-key="${o.key}">
      <label>${o.label}</label><div class="v" id="v-${o.key}">${o.fmt(o.value)}</div>
      <input type="range" min="${o.min}" max="${o.max}" step="${o.step}" value="${o.value}" data-key="${o.key}">
      ${o.steps ? `<div class="steps">${o.steps.map(s => `<button class="btn small light" data-step="${s}" data-key="${o.key}">${s > 0 ? '+' : ''}${s}${o.stepUnit || ''}</button>`).join('')}</div>` : ''}
      ${o.hint ? `<div class="hint">${o.hint}</div>` : ''}
    </div>`;
  }
  function buildPolicyTabs() {
    const p = G.state.policy;
    const pct = v => '%' + fmtN(v, 1), pct2 = v => '%' + fmtN(v, 2);
    $('tab-para').innerHTML = `
      <div class="group"><h3>Politika Faizi</h3><div class="desc">Enflasyonla mücadelenin ana silahı. Beklentilerin üzerinde reel faiz TL'yi cazip kılar, talebi soğutur; ama büyüme ve esnaf bedel öder. Etkisi 2–3 çeyrekte belirginleşir.</div>
        ${slider({ key: 'rate', label: 'Politika faizi', value: p.rate, min: 0, max: rateMax(G.state), step: 0.25, fmt: pct2, steps: [-5, -2.5, -1, 1, 2.5, 5], stepUnit: ' p', hint: 'Reel faiz: <b id="realRateHint"></b>' })}
      </div>
      <div class="group"><h3>Likidite ve Makro İhtiyati Araçlar</h3><div class="desc">Zorunlu karşılıklar kredi genişlemesini frenler; kredi standartları bankaların risk iştahını sınırlar.</div>
        ${slider({ key: 'rr', label: 'Zorunlu karşılık (TL)', value: p.rr, min: 0, max: 30, step: 0.5, fmt: pct })}
        ${slider({ key: 'rrFx', label: 'Zorunlu karşılık (Döviz)', value: p.rrFx, min: 0, max: 40, step: 1, fmt: pct })}
        <div class="ctl"><label>Kredi standartları</label><div></div><div class="seg-btns" data-key="creditStd">
          <button class="btn small light" data-val="-1">Gevşek</button><button class="btn small light" data-val="0">Normal</button><button class="btn small light" data-val="1">Sıkı</button></div></div>
      </div>
      <div class="group"><h3>İletişim ve İleri Yönlendirme</h3><div class="desc">Sözleriniz de politika aracıdır. Şahin duruş beklentileri düşürür (güvenilirliğiniz kadar). Verdiğiniz sözü tutmazsanız güven kaybedersiniz.</div>
        <div class="ctl"><label>İletişim duruşu</label><div></div><div class="seg-btns" data-key="comm">
          <button class="btn small light" data-val="1">🦅 Şahin</button><button class="btn small light" data-val="0">⚖️ Nötr</button><button class="btn small light" data-val="-1">🕊️ Güvercin</button></div></div>
        <div class="ctl"><label>İleri yönlendirme</label><div></div><div class="seg-btns" data-key="guidance">
          <button class="btn small light" data-val="belirsiz">Belirsiz</button><button class="btn small light" data-val="siki">Sıkı duruş sürecek</button><button class="btn small light" data-val="gevseme">Gevşeme gelebilir</button></div></div>
      </div>
      <div class="group"><h3>Döviz Müdahalesi (bu ay)</h3><div class="desc">Rezerv satarak kuru savunabilir ya da döviz alarak rezerv biriktirebilirsiniz. Rezerv zayıfken satış güvenilirliği aşındırır.</div>
        <div class="ctl"><label>Müdahale</label><div class="v" id="v-intervention">Yok</div><div class="fx-row" data-key="intervention">
          <button class="btn small light" data-val="10">Sat 10 mlr $</button><button class="btn small light" data-val="5">Sat 5</button><button class="btn small light" data-val="1">Sat 1</button>
          <button class="btn small light" data-val="0">Yok</button><button class="btn small light" data-val="-2">Al 2</button><button class="btn small light" data-val="-5">Al 5</button></div></div>
      </div>`;
    $('tab-maliye').innerHTML = `
      <div class="group"><h3>Bütçe Özeti</h3><div class="budget" id="budgetBox"></div></div>
      <div class="group"><h3>Vergiler</h3><div class="desc">Doğrudan vergi (gelir/kurumlar) talebi ve iş dünyasını etkiler; dolaylı vergi (KDV/ÖTV) doğrudan etiketlere yansır.</div>
        ${slider({ key: 'directTax', label: 'Doğrudan vergi (% GSYH)', value: p.directTax, min: 10, max: 30, step: 0.5, fmt: pct })}
        ${slider({ key: 'indirectTax', label: 'Dolaylı vergi (% GSYH)', value: p.indirectTax, min: 10, max: 28, step: 0.5, fmt: pct, hint: 'Her 1 puan artış enflasyona ~0,45 puan ekler.' })}
      </div>
      <div class="group"><h3>Harcamalar</h3><div class="desc">Cari harcama memur ve kamu hizmetlerini, yatırım büyümeyi ve potansiyeli, transferler emekli ve dar gelirliyi destekler. Hepsi bütçe açığını büyütür.</div>
        ${slider({ key: 'spendCurrent', label: 'Cari harcamalar (% GSYH)', value: p.spendCurrent, min: 14, max: 32, step: 0.5, fmt: pct })}
        ${slider({ key: 'invest', label: 'Yatırım harcamaları (% GSYH)', value: p.invest, min: 1, max: 12, step: 0.5, fmt: pct })}
        ${slider({ key: 'transfers', label: 'Sosyal transferler (% GSYH)', value: p.transfers, min: 3, max: 16, step: 0.5, fmt: pct })}
      </div>`;
    $('tab-program').innerHTML = `<div class="desc note" style="margin-bottom:10px">Programlar açık kaldığı sürece bütçeye yük bindirir (ya da tasarruf sağlar) ve halk kesimlerini doğrudan etkiler.</div>` +
      Model.PROGRAMS.map(pr => `<div class="program" data-prog="${pr.id}"><div class="ico">${pr.icon}</div><div class="info"><b>${pr.name}</b><p>${pr.desc}</p><div class="cost">${pr.cost > 0 ? 'Maliyet' : 'Tasarruf'}: ${fmtN(Math.abs(pr.cost), 1)} puan GSYH / yıl</div></div><div class="switch" data-prog="${pr.id}"></div></div>`).join('') +
      `<div class="group"><h3>Asgari Ücret</h3><div class="desc">Ocak ve Temmuz aylarında asgari ücret kararı sorulur. Son karar: <b id="minWageLast">—</b></div></div>`;
    // olay bağlama
    document.querySelectorAll('.col-mid input[type=range]').forEach(inp => inp.addEventListener('input', e => setPolicy(e.target.dataset.key, parseFloat(e.target.value), true)));
    document.querySelectorAll('.col-mid button[data-step]').forEach(b => b.addEventListener('click', e => setPolicy(b.dataset.key, G.state.policy[b.dataset.key] + parseFloat(b.dataset.step))));
    document.querySelectorAll('.col-mid .seg-btns, .col-mid .fx-row').forEach(box => box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const k = box.dataset.key; const v = isNaN(parseFloat(b.dataset.val)) ? b.dataset.val : parseFloat(b.dataset.val); setPolicy(k, v);
    })));
    document.querySelectorAll('.switch[data-prog]').forEach(sw => sw.addEventListener('click', () => {
      const id = sw.dataset.prog; G.state.programs[id] = !G.state.programs[id];
      const pr = Model.PROGRAMS.find(x => x.id === id);
      Sound.play(G.state.programs[id] ? 'switchOn' : 'switchOff');
      toast((G.state.programs[id] ? 'Başlatıldı: ' : 'Durduruldu: ') + pr.name, G.state.programs[id] ? 'good' : '');
      if (G.state.programs[id]) G.city.floatAt(id === 'konut' ? 'site' : (id === 'gaz' || id === 'gidaKdv' ? 'market' : 'meclis'), pr.icon + ' ' + pr.name.split(' ')[0], '#fde68a');
      Model.recomputeDerived(G.state); renderPolicy(); renderHeader(); save();
    }));
  }

  function rateMax(s) { return (s.exp > 45 || s.infl > 45 || s.policy.rate > 70) ? 200 : 80; }
  function setPolicy(key, val, fromSlider) {
    const p = G.state.policy; const ranges = { rate: [0, rateMax(G.state)], rr: [0, 30], rrFx: [0, 40], directTax: [10, 30], indirectTax: [10, 28], spendCurrent: [14, 32], invest: [1, 12], transfers: [3, 16] };
    if (ranges[key]) val = Model.clamp(val, ranges[key][0], ranges[key][1]);
    if (key === 'intervention' && val > 0 && G.state.reserves - val < 0) { toast('Yeterli rezerv yok!', 'bad'); return; }
    const old = p[key]; p[key] = val;
    if (key === 'rate' && old !== val && !fromSlider) Sound.play(val > old ? 'rateUp' : 'rateDown');
    if (key !== 'rate' && !fromSlider && old !== val) Sound.play(key === 'intervention' ? 'fx' : 'click');
    if (key === 'rate' && old !== val && !fromSlider) G.city.floatAt('cb', (val > old ? 'FAİZ ↑ ' : 'FAİZ ↓ ') + '%' + fmtN(val, 2), val > old ? '#fca5a5' : '#86efac');
    if (key === 'intervention') G.city.floatAt('cb', val > 0 ? `DÖVİZ SAT ${val} mlr $` : (val < 0 ? `DÖVİZ AL ${-val} mlr $` : ''), '#fde68a');
    Model.recomputeDerived(G.state); renderPolicy(!fromSlider); renderHeader(); save();
  }

  function renderPolicy(syncSliders) {
    const s = G.state, p = s.policy, prev = s.prevPolicy;
    const fm = { rate: v => '%' + fmtN(v, 2), rr: v => '%' + fmtN(v, 1), rrFx: v => '%' + fmtN(v, 1), directTax: v => '%' + fmtN(v, 1), indirectTax: v => '%' + fmtN(v, 1), spendCurrent: v => '%' + fmtN(v, 1), invest: v => '%' + fmtN(v, 1), transfers: v => '%' + fmtN(v, 1) };
    Object.keys(fm).forEach(k => { const el = $('v-' + k); if (!el) return; el.textContent = fm[k](p[k]); el.classList.toggle('changed', Math.abs(p[k] - prev[k]) > 1e-9); if (syncSliders !== false) { const inp = document.querySelector(`input[data-key=${k}]`); if (inp && parseFloat(inp.value) !== p[k]) inp.value = p[k]; } });
    document.querySelectorAll('.seg-btns, .fx-row').forEach(box => { const k = box.dataset.key; box.querySelectorAll('button').forEach(b => { const v = isNaN(parseFloat(b.dataset.val)) ? b.dataset.val : parseFloat(b.dataset.val); b.classList.toggle('active', v === p[k]); }); });
    const iv = $('v-intervention'); if (iv) iv.textContent = p.intervention > 0 ? `Sat ${p.intervention} mlr $` : (p.intervention < 0 ? `Al ${-p.intervention} mlr $` : 'Yok');
    const rs = document.querySelector('input[data-key=rate]'); if (rs) { const mx = rateMax(s); if (parseFloat(rs.max) !== mx) rs.max = mx; }
    const rr = $('realRateHint'); if (rr) { const r = p.rate - s.exp; rr.textContent = (r >= 0 ? '+' : '') + fmtN(r, 1) + ' puan' + (r < 0 ? ' (negatif: TL cazip değil)' : r > 10 ? ' (çok sıkı)' : ''); rr.style.color = r < 0 ? 'var(--red)' : 'var(--green)'; }
    document.querySelectorAll('.switch[data-prog]').forEach(sw => { sw.classList.toggle('on', !!s.programs[sw.dataset.prog]); sw.closest('.program').classList.toggle('on', !!s.programs[sw.dataset.prog]); });
    const bb = $('budgetBox'); if (bb) {
      const taxes = p.directTax + p.indirectTax, spend = p.spendCurrent + p.invest + p.transfers + Model.PROGRAMS.reduce((a, x) => a + (s.programs[x.id] ? x.cost : 0), 0);
      bb.innerHTML = `<div>Gelirler<b>%${fmtN(taxes, 1)}</b></div><div>Harcamalar<b>%${fmtN(spend, 1)}</b></div><div>Faiz yükü<b>%${fmtN(s.interest, 1)}</b></div><div>Bütçe ${s.deficit >= 0 ? 'açığı' : 'fazlası'}<b style="color:${s.deficit > 5 ? 'var(--red)' : 'var(--green)'}">%${fmtN(Math.abs(s.deficit), 1)}</b></div>`;
    }
    const mw = $('minWageLast'); if (mw) mw.textContent = p.minWageRaise === null ? 'henüz yok' : '%' + fmtN(p.minWageRaise, 0) + ' zam';
  }

  // ============ Render ============
  function renderAll(full) {
    renderHeader(); renderIndicators(true); renderChart(); renderPeople(); renderPolicy(true); renderTicker();
    G.city.setState(G.state);
  }
  function renderHeader() {
    const s = G.state;
    $('dateLabel').textContent = `${Model.MONTHS[s.month - 1]} ${s.year}`;
    $('turnLabel').textContent = `${s.turn + 1}. ay / ${s.termMonths} · Skor ${s.score}`;
    $('termFill').style.width = (s.turn / s.termMonths * 100) + '%';
    const seasons = { kis: '❄️ Kış', ilkbahar: '🌸 İlkbahar', yaz: '☀️ Yaz', sonbahar: '🍂 Sonbahar' };
    $('hudSeason').textContent = seasons[G.city.season] || '';
    $('hudBread').textContent = `🥖 Ekmek ₺${s.breadPrice >= 100 ? fmtN(s.breadPrice, 0) : fmtN(s.breadPrice, 2)}`;
    $('btnAuto').classList.toggle('on', !!G.auto);
    $('mbAuto').classList.toggle('on', !!G.auto);
    $('mbDate').innerHTML = `<b>${Model.MONTHS[s.month - 1].slice(0, 3)} ${s.year}</b><small>${s.turn + 1}/${s.termMonths} ay · ${s.score} puan</small>`;
  }
  function renderIndicators(animate) {
    const s = G.state, box = $('indicators');
    if (!box.children.length) {
      box.innerHTML = INDICATORS.map(d => `<div class="ind" data-key="${d.key}"><div class="lbl"><span>${d.label}</span><span class="delta" id="d-${d.key}"></span></div><div class="val" id="i-${d.key}">—</div>${d.target ? `<div class="tgt" id="t-${d.key}"></div>` : ''}${d.bar ? `<div class="bar"><i id="b-${d.key}"></i></div>` : ''}<canvas id="c-${d.key}"></canvas></div>`).join('');
      box.querySelectorAll('.ind').forEach(el => el.addEventListener('click', () => { G.selectedInd = el.dataset.key; const map = { infl: 'infl', core: 'infl', exp: 'infl', growth: 'growth', unemp: 'growth', fx: 'fx', reserves: 'reserves', cds: 'reserves', debt: 'fiscal', deficit: 'fiscal', ca: 'fiscal', cred: 'people' }; G.chart = map[el.dataset.key]; renderChart(); box.querySelectorAll('.ind').forEach(x => x.classList.toggle('selected', x === el)); }));
    }
    const h = s.history, prev = h.length > 1 ? h[h.length - 2] : null;
    INDICATORS.forEach(d => {
      const v = s[d.key], el = $('i-' + d.key);
      const target = d.unit === '%' || d.unit === '/100' ? (d.unit === '%' ? '%' : '') : '';
      const txt = (d.unit === '%' ? '%' : '') + fmtN(v, d.dec) + (d.unit && d.unit !== '%' ? d.unit : '');
      if (animate && G.prevVals[d.key] !== undefined && Math.abs(G.prevVals[d.key] - v) > 1e-6) tweenText(el, G.prevVals[d.key], v, d);
      else el.textContent = txt;
      G.prevVals[d.key] = v;
      const de = $('d-' + d.key);
      if (prev) { const dv = v - prev[d.key]; const dir = Math.abs(dv) < (d.dec === 0 ? 0.5 : 0.05) ? 'flat' : ((dv > 0) === (d.good === 'up') ? 'good' : 'bad'); de.className = 'delta ' + dir; de.textContent = dir === 'flat' ? '=' : (dv > 0 ? '▲ +' : '▼ ') + fmtN(dv, d.dec); if (animate && dir !== 'flat') { const card = el.closest('.ind'); card.classList.remove('flash-up', 'flash-down'); void card.offsetWidth; card.classList.add(dir === 'bad' ? 'flash-up' : 'flash-down'); } } else de.textContent = '';
      if (d.target) $('t-' + d.key).textContent = `Hedef %${fmtN(d.target(s), 0)}`;
      if (d.bar) { const [a, b] = d.bar; const t = Model.clamp((v - a) / (b - a), 0, 1); $('b-' + d.key).style.left = `calc(${(t * 100).toFixed(1)}% - 1px)`; }
      Charts.sparkline($('c-' + d.key), h.slice(-24).map(x => x[d.key]), d.color, d.target ? { target: d.target(s) } : {});
    });
  }
  function tweenText(el, from, to, d) {
    const t0 = performance.now(), dur = 700;
    const fmt = v => (d.unit === '%' ? '%' : '') + fmtN(v, d.dec) + (d.unit && d.unit !== '%' ? d.unit : '');
    (function f(t) { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); })(t0);
  }
  function renderChart() {
    const s = G.state, set = CHART_SETS[G.chart]; if (!s || !set) return;
    document.querySelectorAll('#chartTabs button').forEach(b => b.classList.toggle('active', b.dataset.k === G.chart));
    const h = s.history.slice(-48);
    Charts.lineChart($('mainChart'), set.series.map(([k, n, c, dash]) => ({ name: n, data: h.map(x => x[k]), color: c, dash })), h.map(x => x.label), { unit: set.unit, target: set.target ? set.target(s) : undefined });
  }
  function renderPeople() {
    const s = G.state;
    Charts.gauge($('gSupport'), s.support, s.support >= 50 ? '#2e8b57' : (s.support >= 30 ? '#d97706' : '#c62828'));
    Charts.gauge($('gAnger'), s.anger, s.anger < 40 ? '#2e8b57' : (s.anger < 65 ? '#d97706' : '#c62828'));
    Charts.gauge($('gCred'), s.cred, '#7c5cbf');
    const box = $('segments');
    if (!box.children.length) box.innerHTML = Model.SEGMENTS.map(seg => `<div class="seg" data-seg="${seg.id}"><div class="face" id="f-${seg.id}"></div><div><div class="name">${SEG_ICON[seg.id]} ${seg.name} <span class="share">%${Math.round(seg.share * 100)}</span></div></div><div class="mood" id="m-${seg.id}"></div><div class="bar"><i id="mb-${seg.id}"></i></div></div>`).join('');
    Model.SEGMENTS.forEach(seg => { const m = s.moods[seg.id]; const f = $('f-' + seg.id); f.textContent = FACES(m); f.classList.toggle('angry', m < 30); $('m-' + seg.id).textContent = Math.round(m); const b = $('mb-' + seg.id); b.style.width = m + '%'; b.style.background = m >= 60 ? '#2e8b57' : (m >= 40 ? '#d97706' : '#c62828'); });
    // sokaktan sesler
    const ul = $('voiceList');
    if (!ul.children.length || s.turn !== G.lastVoiceTurn) { G.lastVoiceTurn = s.turn; ul.innerHTML = ''; const segs = Model.SEGMENTS.slice().sort(() => Math.random() - 0.5).slice(0, 3); segs.forEach(seg => addVoice(seg, Voices.pickQuote(seg.id, s.moods[seg.id]))); }
    $('advisorNote').textContent = Voices.advisorComment(s, s.lastReport)[0];
  }
  function addVoice(seg, q, top) {
    const ul = $('voiceList'); const li = document.createElement('li'); li.style.borderLeftColor = seg.color; li.innerHTML = `<b>${seg.name}</b>${q}`;
    if (top) ul.prepend(li); else ul.appendChild(li);
    while (ul.children.length > 4) ul.removeChild(ul.lastChild);
  }
  function renderTicker() {
    const s = G.state; const items = (s.newsLog.length ? s.newsLog : ['Ekonomi yönetimi göreve başladı. Piyasalar ilk kararları bekliyor.', 'Vatandaş: "Bakalım bu sefer ne olacak?"']).slice(0, 8);
    $('tickerTrack').innerHTML = items.map(n => `<span>${n}</span>`).join('') + items.map(n => `<span>${n}</span>`).join('');
  }

  // ============ Tur ilerletme ============
  function advance(n) {
    if (G.busy || !G.state || G.state.gameOver) return;
    const s = G.state;
    const angerBefore = s.anger;
    // Asgari ücret kararı (Ocak & Temmuz, ayın başında)
    if ((s.month === 1 || s.month === 7) && s.flags.minWageMonth !== s.turn) { s.flags.minWageMonth = s.turn; showMinWage(() => advance(n)); return; }
    G.busy = true; $('btnMonth').disabled = true; $('btnQuarter').disabled = true; $('mbMonth').disabled = true; $('mbQuarter').disabled = true;
    const report = Model.step(s, G.rng);
    G.city.setState(s, { newMonth: true });
    renderAll();
    Sound.play(s.turn % 3 === 0 ? 'quarter' : 'tick');
    if (angerBefore <= 58 && s.anger > 58) { Sound.play('crowd'); toast('Meclis önünde protesto başladı!', 'bad'); }
    else if (s.anger > 75 && s.turn % 2 === 0) Sound.play('crowd');
    report.notes.forEach(t => toast(t, 'bad'));
    if (report.delta.unemp < -0.15) G.city.floatAt('factory', '+ İSTİHDAM', '#86efac');
    if (report.delta.unemp > 0.15) G.city.floatAt('factory', '− İŞTEN ÇIKARMA', '#fca5a5');
    save();
    const cont = () => { G.busy = false; $('btnMonth').disabled = false; $('btnQuarter').disabled = false; $('mbMonth').disabled = false; $('mbQuarter').disabled = false; if (s.gameOver) { stopAuto(); showEnd(); return; } if (n > 1) setTimeout(() => advance(n - 1), 350); else if (G.auto) G.autoTimer = setTimeout(() => advance(1), 1800); };
    // Çeyrek raporu
    const isQuarter = s.turn % 3 === 0;
    const sc = Model.SCENARIOS.find(x => x.id === s.scenarioId);
    const ev = s.gameOver ? null : (s.turn === 1 && sc && sc.firstEvent ? Events.EVENTS.find(x => x.id === sc.firstEvent) : Events.pickEvent(s, G.rng));
    const afterEvent = () => { if (isQuarter && !s.gameOver) showReport(report, cont); else cont(); };
    setTimeout(() => { if (ev) showEvent(ev, afterEvent); else afterEvent(); }, 500);
  }
  function toggleAuto() { if (G.auto) stopAuto(); else { G.auto = true; renderHeader(); advance(1); } }
  function stopAuto() { G.auto = false; clearTimeout(G.autoTimer); renderHeader(); }

  // ============ Modallar ============
  function showModal(html, opts) {
    opts = opts || {}; const m = $('modal'), c = $('modalCard'); c.innerHTML = html; m.classList.remove('hidden');
    if (opts.closable) m.onclick = e => { if (e.target === m) closeModal(); }; else m.onclick = null;
    return c;
  }
  function closeModal() { $('modal').classList.add('hidden'); $('modalCard').classList.remove('wide'); }
  function advisorBlock(text) { return `<div class="dialog"><div class="advisor-avatar"></div><div class="bubble">${text}</div></div>`; }

  function showStartModal() {
    let sc = Model.SCENARIOS[0].id, diff = 'orta';
    const c = showModal(`<div class="modal-head"><div class="ico">🏛️</div><div><div class="kicker">Yeni Oyun</div><h2>Ülkeyi Yönet</h2></div></div>
      <div class="modal-body">${advisorBlock('Hoş geldiniz Başkanım! Hangi ülkeyi devralmak istersiniz? Her senaryo farklı bir başlangıç noktası sunar. Görev süreniz 48 ay; sonunda seçim var.')}
      <h3>Senaryo</h3><div class="scenarios">${Model.SCENARIOS.map(x => `<button class="scenario ${x.id === sc ? 'active' : ''}" data-sc="${x.id}"><div class="ico">${x.icon}</div><div><b>${x.title}<span class="tag ${x.tag.includes('Zor') ? 'zor' : x.tag === 'Kolay' ? 'kolay' : ''}">${x.tag}</span></b><p>${x.desc}</p><div class="stats"><span>Enflasyon %${fmtN(x.state.infl, 1)}</span><span>Faiz %${fmtN(x.state.rate, 2)}</span><span>USD/TRY ${fmtN(x.state.fx, 2)}</span><span>Büyüme %${fmtN(x.state.growth, 1)}</span><span>İşsizlik %${fmtN(x.state.unemp, 1)}</span></div></div></button>`).join('')}</div>
      <h3>Zorluk</h3><div class="diff-row">${Object.keys(Model.DIFFICULTIES).map(k => `<button class="btn light ${k === diff ? 'active' : ''}" data-diff="${k}" title="${Model.DIFFICULTIES[k].desc}">${Model.DIFFICULTIES[k].label}</button>`).join('')}</div>
      <div class="note" id="diffNote">${Model.DIFFICULTIES[diff].desc}</div></div>
      <div class="modal-foot"><button class="btn light" id="startScores">🏆 Skor Tablosu</button><button class="btn primary" id="startBtn">🚀 Göreve Başla</button></div>`);
    c.classList.add('wide');
    $('startScores').addEventListener('click', () => showScores(showStartModal));
    c.querySelectorAll('.scenario').forEach(b => b.addEventListener('click', () => { sc = b.dataset.sc; c.querySelectorAll('.scenario').forEach(x => x.classList.toggle('active', x === b)); }));
    c.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => { diff = b.dataset.diff; c.querySelectorAll('[data-diff]').forEach(x => x.classList.toggle('active', x === b)); $('diffNote').textContent = Model.DIFFICULTIES[diff].desc; }));
    $('startBtn').addEventListener('click', () => { Sound.play('good'); closeModal(); newGame(sc, diff); });
  }
  function showContinueModal(saved) {
    const c = showModal(`<div class="modal-head"><div class="ico">💾</div><div><div class="kicker">Kayıtlı oyun bulundu</div><h2>Devam edilsin mi?</h2></div></div>
      <div class="modal-body"><p>${Model.SCENARIOS.find(x => x.id === saved.scenarioId).title} · ${Model.MONTHS[saved.month - 1]} ${saved.year} · ${saved.turn}. ay · Skor ${saved.score}</p></div>
      <div class="modal-foot"><button class="btn light" id="newBtn">Yeni Oyun</button><button class="btn primary" id="contBtn">▶ Devam Et</button></div>`);
    $('newBtn').addEventListener('click', () => { closeModal(); showStartModal(); });
    $('contBtn').addEventListener('click', () => { closeModal(); G.state = saved; G.rng = Model.makeRng(saved.seed + saved.turn * 7919); Model.recomputeDerived(G.state); G.city.setState(G.state, { newMonth: true }); buildPolicyTabs(); renderAll(true); if (saved.gameOver) showEnd(); });
  }
  function showTutorial(i) {
    const t = Voices.TUTORIAL;
    const c = showModal(`<div class="modal-head"><div class="ico">🎓</div><div><div class="kicker">Brifing ${i + 1}/${t.length}</div><h2>Başekonomist Nilüfer</h2></div></div>
      <div class="modal-body">${advisorBlock(t[i].text)}</div>
      <div class="modal-foot"><button class="btn light" id="skipBtn">Atla</button><button class="btn primary" id="nextBtn">${i < t.length - 1 ? 'İleri →' : 'Başlayalım!'}</button></div>`);
    $('skipBtn').addEventListener('click', closeModal);
    $('nextBtn').addEventListener('click', () => { if (i < t.length - 1) showTutorial(i + 1); else closeModal(); });
  }
  function showEvent(ev, done) {
    stopAutoSoft(); Sound.play('event');
    const c = showModal(`<div class="modal-head"><div class="ico">${ev.icon}</div><div><div class="kicker">Son dakika · ${Model.MONTHS[G.state.month - 1]} ${G.state.year}</div><h2>${ev.title}</h2></div></div>
      <div class="modal-body"><p>${ev.text}</p><h3>Kararınız?</h3>${ev.choices.map((ch, i) => `<button class="choice" data-i="${i}"><b>${ch.label}</b><span>${ch.desc}</span></button>`).join('')}</div>`);
    c.querySelectorAll('.choice').forEach(b => b.addEventListener('click', () => {
      const ch = ev.choices[parseInt(b.dataset.i)]; ch.apply(G.state); Sound.play('click');
      Model.SEGMENTS.forEach(sg => G.state.moods[sg.id] = Model.clamp(G.state.moods[sg.id], 0, 100));
      G.state.cred = Model.clamp(G.state.cred, 0, 100); G.state.support = Model.clamp(G.state.support, 0, 100); G.state.anger = Model.clamp(G.state.anger, 0, 100);
      G.state.events.push({ id: ev.id, turn: G.state.turn, choice: ch.label, title: ev.title });
      Model.recomputeDerived(G.state); Model.checkGameOver(G.state);
      closeModal(); toast(`${ev.icon} ${ev.title}: ${ch.label}`); G.city.floatAt('meclis', ev.icon + ' ' + ev.title, '#fde68a');
      renderAll(); save(); done();
    }));
  }
  function stopAutoSoft() { clearTimeout(G.autoTimer); }
  function showReport(report, done) {
    Sound.play('report');
    const s = G.state, h = s.history; const q = Math.ceil(s.month / 3) === 1 ? 4 : Math.ceil((s.month - 1) / 3); const year = s.month === 1 ? s.year - 1 : s.year;
    const ago = h[Math.max(0, h.length - 4)], now = h[h.length - 1];
    const rows = [['Manşet enflasyon', 'infl', '%', 1, 'down'], ['Çekirdek enflasyon', 'core', '%', 1, 'down'], ['Büyüme', 'growth', '%', 1, 'up'], ['İşsizlik', 'unemp', '%', 1, 'down'], ['USD/TRY', 'fx', '', 2, 'down'], ['Rezervler (mlr $)', 'reserves', '', 1, 'up'], ['CDS (bp)', 'cds', '', 0, 'down'], ['Borç/GSYH', 'debt', '%', 1, 'down'], ['Kamuoyu desteği', 'support', '', 0, 'up'], ['Güvenilirlik', 'cred', '', 0, 'up']];
    const head = s.infl < ago.infl - 1 ? ['ENFLASYONDA GERİLEME', `Manşet enflasyon %${fmtN(s.infl, 1)}'e indi. Piyasalar programı alkışlıyor.`] : s.infl > ago.infl + 1 ? ['ZAM DALGASI SÜRÜYOR', `Enflasyon %${fmtN(s.infl, 1)}'e çıktı. Vatandaş pazarda zorlanıyor.`] : s.unemp < ago.unemp - 0.3 ? ['İSTİHDAMDA GÜZEL HABER', `İşsizlik %${fmtN(s.unemp, 1)}. İşverenler eleman arıyor.`] : s.growth > 5 ? ['EKONOMİ TAM GAZ', `Büyüme %${fmtN(s.growth, 1)}. Fabrikalar tam kapasite.`] : ['BEKLE VE GÖR', 'Göstergeler yatay seyrediyor; piyasa yeni bir sinyal bekliyor.'];
    const c = showModal(`<div class="modal-head"><div class="ico">📋</div><div><div class="kicker">${year} · ${q}. Çeyrek Raporu</div><h2>Üç aylık değerlendirme</h2></div></div>
      <div class="modal-body">
        <div class="newspaper"><div class="np-title">EKONOMİ AJANSI</div><div class="np-head">${head[0]}</div><div class="np-sub">${head[1]}</div></div>
        ${advisorBlock(Voices.advisorComment(s, report).map(x => `<p>${x}</p>`).join(''))}
        <table class="report-table"><tr><td></td><td>3 ay önce</td><td>Şimdi</td></tr>${rows.map(([n, k, u, d, good]) => { const dv = now[k] - ago[k]; const cls = Math.abs(dv) < 0.05 ? '' : ((dv > 0) === (good === 'up') ? 'good' : 'bad'); return `<tr><td>${n}</td><td>${u}${fmtN(ago[k], d)}</td><td class="${cls}">${u}${fmtN(now[k], d)} <small>(${dv >= 0 ? '+' : ''}${fmtN(dv, d)})</small></td></tr>`; }).join('')}</table>
      </div><div class="modal-foot"><button class="btn primary" id="okBtn">Devam</button></div>`);
    $('okBtn').addEventListener('click', () => { closeModal(); done(); });
  }
  function showMinWage(done) {
    const s = G.state; let val = Math.round(Model.clamp(s.infl + 5, 0, 150));
    const c = showModal(`<div class="modal-head"><div class="ico">💰</div><div><div class="kicker">${Model.MONTHS[s.month - 1]} ${s.year} · Karar</div><h2>Asgari Ücret Zammı</h2></div></div>
      <div class="modal-body">${advisorBlock(`Enflasyon %${fmtN(s.infl, 1)}, beklenti %${fmtN(s.exp, 1)}. Enflasyonun altında bir zam işçiyi küstürür; çok üstü ise esnafın maliyetini ve enflasyonu artırır. Ne kadar zam yapıyoruz?`)}
        <div class="wage-val" id="wageVal">%${val}</div><input type="range" class="wage-slider" id="wageSlider" min="0" max="150" step="1" value="${val}">
        <div class="note" id="wageNote"></div></div>
      <div class="modal-foot"><button class="btn primary" id="wageBtn">Kararı Açıkla</button></div>`);
    const note = () => { const g = val - s.infl; $('wageNote').textContent = g < -5 ? '⚠️ Enflasyonun çok altında: işçi ve gençler öfkelenecek.' : g < 3 ? 'Enflasyona yakın: dengeli ama coşku yaratmaz.' : g < 15 ? '👍 Reel artış: işçi memnun, esnaf hafif tedirgin.' : '🔥 Çok yüksek: esnaf isyan eder, enflasyona ek baskı.'; };
    note();
    $('wageSlider').addEventListener('input', e => { val = parseInt(e.target.value); $('wageVal').textContent = '%' + val; note(); });
    $('wageBtn').addEventListener('click', () => { Sound.play('coin'); Model.applyMinWage(s, val); closeModal(); toast(`Asgari ücrete %${val} zam açıklandı`); G.city.floatAt('meclis', `ASGARİ ÜCRET +%${val}`, '#fde68a'); renderPolicy(); save(); done(); });
  }
  function showEnd() {
    const s = G.state, go = s.gameOver, gr = Model.grade(s); const won = go.type === 'secim_zafer';
    Sound.play(won ? 'win' : 'lose');
    const first = s.history[0], last = s.history[s.history.length - 1];
    const scoreId = recordScore(s);
    showModal(`<div class="modal-head"><div class="ico">${won ? '🏆' : go.type === 'secim_yenilgi' ? '🗳️' : '💥'}</div><div><div class="kicker">Oyun bitti · ${s.turn}. ay</div><h2>${go.title}</h2></div></div>
      <div class="modal-body"><p>${go.text}</p><div class="grade ${gr}">${gr}</div><p style="text-align:center"><b>Toplam skor: ${s.score}</b> · Ortalama ${Math.round(s.score / Math.max(1, s.turn))}/ay</p>
        <div class="stats-grid"><div>Enflasyon<b>%${fmtN(first.infl, 1)} → %${fmtN(last.infl, 1)}</b></div><div>İşsizlik<b>%${fmtN(first.unemp, 1)} → %${fmtN(last.unemp, 1)}</b></div><div>USD/TRY<b>${fmtN(first.fx, 2)} → ${fmtN(last.fx, 2)}</b></div><div>Rezervler<b>${fmtN(first.reserves, 0)} → ${fmtN(last.reserves, 0)}</b></div><div>Destek<b>${Math.round(first.support)} → ${Math.round(last.support)}</b></div><div>Güvenilirlik<b>${Math.round(first.cred)} → ${Math.round(last.cred)}</b></div></div>
        ${s.events.length ? `<h3>Yaşanan olaylar</h3><div class="note">${s.events.map(e => `${e.title} → ${e.choice}`).join(' · ')}</div>` : ''}
        <h3>🏆 Skor tablosu</h3><div class="name-row"><label for="nameInput">Adınız:</label><input id="nameInput" maxlength="20" value="${esc(playerName())}" placeholder="Başkan"></div><div id="lbBox">${scoreTableHtml(scoreId, 10)}</div></div>
      <div class="modal-foot"><button class="btn light" id="endClose">Tabloyu İncele</button><button class="btn light" id="endScores">Tüm skorlar</button><button class="btn primary" id="endNew">🔄 Yeni Oyun</button></div>`);
    $('endClose').addEventListener('click', closeModal);
    $('endScores').addEventListener('click', () => showScores(showEnd));
    $('nameInput').addEventListener('input', e => { const n = e.target.value.trim() || 'Başkan'; renameScore(scoreId, n); $('lbBox').innerHTML = scoreTableHtml(scoreId, 10); });
    $('endNew').addEventListener('click', () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* yoksay */ } closeModal(); showStartModal(); });
  }
  function showMenu() {
    const c = showModal(`<div class="modal-head"><div class="ico">☰</div><div><h2>Menü</h2></div></div><div class="modal-body menu-list">
      <button class="btn light" id="mResume">▶ Oyuna dön</button><button class="btn light" id="mHelp">🎓 Nasıl oynanır?</button><button class="btn light" id="mEvents">📜 Olay günlüğü</button><button class="btn light" id="mScores">🏆 Skor tablosu</button><button class="btn danger" id="mNew">🔄 Yeni oyun (kayıt silinir)</button>
      <p class="note">Kısayollar: Enter veya Boşluk = ay ilerlet · Shift+Enter = çeyrek · ↑/↓ = faiz ±1 puan · Enter = açık penceredeki Devam düğmesi</p></div>`, { closable: true });
    $('mResume').addEventListener('click', closeModal);
    $('mHelp').addEventListener('click', () => showTutorial(0));
    $('mScores').addEventListener('click', () => showScores(showMenu));
    $('mEvents').addEventListener('click', () => { const ev = G.state.events; showModal(`<div class="modal-head"><div class="ico">📜</div><div><h2>Olay günlüğü</h2></div></div><div class="modal-body">${ev.length ? ev.map(e => `<div class="headline">${e.turn}. ay · ${e.title} → <i>${e.choice}</i></div>`).join('') : '<p>Henüz olay yaşanmadı.</p>'}</div><div class="modal-foot"><button class="btn primary" id="evClose">Kapat</button></div>`); $('evClose').addEventListener('click', closeModal); });
    confirmButton($('mNew'), '⚠️ Eminim, mevcut oyunu sil', () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* yoksay */ } stopAuto(); closeModal(); showStartModal(); });
  }

  // ============ Skor tablosu ============
  function loadScores() { try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; } catch (e) { return []; } }
  function saveScores(list) { try { localStorage.setItem(LB_KEY, JSON.stringify(list.slice(0, 50))); } catch (e) { /* yoksay */ } }
  function playerName() { try { return localStorage.getItem(NAME_KEY) || 'Başkan'; } catch (e) { return 'Başkan'; } }
  function recordScore(s) {
    if (s.flags.scoreId) return s.flags.scoreId;
    const sc = Model.SCENARIOS.find(x => x.id === s.scenarioId);
    const first = s.history[0], last = s.history[s.history.length - 1];
    const entry = { id: Date.now() + '-' + Math.floor(Math.random() * 1e6), name: playerName(), date: new Date().toISOString(), scenario: s.scenarioId, scenarioTitle: sc ? sc.title : s.scenarioId, icon: sc ? sc.icon : '🏛️', difficulty: s.difficulty, score: s.score, perMonth: Math.round(s.score / Math.max(1, s.turn)), grade: Model.grade(s), outcome: s.gameOver.type, turns: s.turn, infl: [first.infl, last.infl], unemp: [first.unemp, last.unemp], support: last.support, cred: last.cred };
    const list = loadScores(); list.push(entry); list.sort((a, b) => b.score - a.score); saveScores(list);
    s.flags.scoreId = entry.id; save();
    return entry.id;
  }
  function renameScore(id, name) { const list = loadScores(); const e = list.find(x => x.id === id); if (e) { e.name = name; saveScores(list); } try { localStorage.setItem(NAME_KEY, name); } catch (err) { /* yoksay */ } }
  const OUTCOME = { secim_zafer: '🏆 Seçim zaferi', secim_yenilgi: '🗳️ Seçim yenilgisi', istifa: '📢 İstifa', hiper: '☢️ Hiperenflasyon', temerrut: '💥 Dış borç krizi' };
  function scoreTableHtml(highlightId, limit) {
    const list = loadScores().slice(0, limit || 10);
    if (!list.length) return '<p class="note">Henüz tamamlanmış oyun yok. İlk rekoru siz kırın!</p>';
    return '<div class="lb-wrap"><table class="lb"><tr><th>#</th><th>Oyuncu</th><th>Senaryo</th><th>Sonuç</th><th>Not</th><th>Skor</th></tr>' + list.map((e, i) => `<tr class="${e.id === highlightId ? 'me' : ''}"><td>${i + 1}</td><td>${esc(e.name)}<small>${new Date(e.date).toLocaleDateString('tr-TR')}</small></td><td>${e.icon} ${esc(e.scenarioTitle)}<small>${Model.DIFFICULTIES[e.difficulty] ? Model.DIFFICULTIES[e.difficulty].label : e.difficulty} · ${e.turns} ay</small></td><td>${OUTCOME[e.outcome] || e.outcome}<small>Enf. %${fmtN(e.infl[0], 0)} → %${fmtN(e.infl[1], 0)}</small></td><td><span class="lb-grade ${e.grade}">${e.grade}</span></td><td><b>${e.score}</b><small>${e.perMonth}/ay</small></td></tr>`).join('') + '</table></div>';
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function showScores(back) {
    const c = showModal(`<div class="modal-head"><div class="ico">🏆</div><div><div class="kicker">En iyi 20</div><h2>Skor Tablosu</h2></div></div>
      <div class="modal-body">${scoreTableHtml(G.state && G.state.flags ? G.state.flags.scoreId : null, 20)}</div>
      <div class="modal-foot">${loadScores().length ? '<button class="btn light" id="lbClear">Tabloyu temizle</button>' : ''}<button class="btn primary" id="lbBack">${back ? '← Geri' : 'Kapat'}</button></div>`, { closable: !back });
    c.classList.add('wide');
    $('lbBack').addEventListener('click', () => { closeModal(); if (back) back(); });
    const cl = $('lbClear'); if (cl) confirmButton(cl, '⚠️ Eminim, tabloyu sil', () => { saveScores([]); showScores(back); });
  }

  // İki adımlı onay: ilk tıklamada düğme "Eminim" olur, 4 sn içinde ikinci tıklama işlemi yapar
  function confirmButton(btn, label, action) {
    btn.addEventListener('click', () => {
      if (btn.dataset.armed) { clearTimeout(btn._t); action(); return; }
      btn.dataset.armed = '1'; btn.dataset.orig = btn.textContent; btn.textContent = label; btn.classList.add('armed'); Sound.play('alarm');
      btn._t = setTimeout(() => { delete btn.dataset.armed; btn.textContent = btn.dataset.orig; btn.classList.remove('armed'); }, 4000);
    });
  }

  // ============ Yardımcılar ============
  function toast(text, cls) { if (!text) return; if (cls === 'bad') Sound.play('bad'); else if (cls === 'good') Sound.play('good'); const t = document.createElement('div'); t.className = 'toast ' + (cls || ''); t.textContent = text; $('toasts').appendChild(t); setTimeout(() => t.remove(), 4200); }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.state)); } catch (e) { /* yoksay */ } }
  function load() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.history ? s : null; } catch (e) { return null; } }

  window.Game = G;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
