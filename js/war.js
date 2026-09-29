/* ===========================================================
   ÜLKEYİ YÖNET — Savaş modülü
   Sınır gerilimi → savaş ilanı → cephe → zafer / ateşkes / yenilgi / işgal
   Savunma gücü ve teknoloji seviyesi barış zamanındaki yatırımlarla oluşur.
   =========================================================== */
(function (global) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const shock = (s, o) => s.shocks.push(Object.assign({ months: 3 }, o));
  const SEG = (s, d) => Object.keys(s.moods).forEach(k => s.moods[k] = clamp(s.moods[k] + d, 0, 100));

  /** Barış zamanı: savunma ve teknoloji birikimi (her ay Model.step içinden çağrılır) */
  function accumulate(state) {
    const p = state.policy;
    const defTarget = 18 + p.defense * 9 + state.tech * 0.12;
    state.defense = clamp(state.defense + 0.06 * (defTarget - state.defense), 0, 100);
    const techTarget = 14 + p.rnd * 14 + p.invest * 1.5 + (state.programs.konut ? 2 : 0);
    state.tech = clamp(state.tech + 0.05 * (techTarget - state.tech), 0, 100);
  }

  /** Savaş gücü: savunma ağırlıklı, teknoloji çarpan, seferberlik ve müttefik katkısı */
  function power(state) {
    const w = state.war || {};
    let pw = state.defense * 0.62 + state.tech * 0.38;
    if (w.mobilized) pw += 18;
    if (w.allies) pw += 14;
    if (w.civil) pw += 3;
    pw *= 1 + (state.cred - 50) / 400; // güven: tedarik ve moral
    return clamp(pw, 5, 140);
  }

  /** Savaş olasılığı kontrolü: gerilim varsa yüksek, yoksa düşük; oyun başına bir savaş */
  function shouldDeclare(state, rng) {
    if (state.war || state.flags.warDone || state.turn < 10 || state.turn > 40) return false;
    const base = state.flags.tension ? 0.14 : 0.025;
    const diffMult = { kolay: 0.7, orta: 1, zor: 1.3 }[state.difficulty] || 1;
    return rng() < base * diffMult;
  }

  function declare(state, rng, opts) {
    opts = opts || {};
    const diffMult = { kolay: 0.85, orta: 1, zor: 1.15 }[state.difficulty] || 1;
    const enemy = clamp((46 + rng() * 32) * diffMult, 35, 95);
    state.war = {
      active: true, month: 0, duration: 6 + Math.floor(rng() * 4), enemy: Math.round(enemy), front: 0,
      casualties: 0, mobilized: !!opts.mobilize, allies: false, civil: false, bonds: false, martial: false, ceasefireAsked: false,
      log: [], startTurn: state.turn, name: opts.enemyName || 'Komşu Cumhuriyet',
    };
    state.flags.warDone = true; state.flags.tension = false;
    if (opts.mobilize) applyAction(state, 'mobilize', rng);
    // İlk şok: piyasa paniği, halk kenetlenmesi
    shock(state, { cds: 160, fx: 2.2, reserves: -4, months: 2 });
    state.support = clamp(state.support + 6, 0, 100); // bayrak etrafında toplanma
    state.anger = clamp(state.anger - 6, 0, 100);
    return state.war;
  }

  const ACTIONS = [
    { id: 'mobilize', name: 'Seferberlik ilan et', icon: '📯', once: true, cost: 'Cari harcama +2 puan, büyüme düşer, gençler ve esnaf tedirgin',
      desc: 'Yedekler silah altına alınır, fabrikalar savaş üretimine geçer. Savaş gücü +18; işsizlik düşer ama ekonomi daralır.',
      apply: (s) => { s.war.mobilized = true; s.policy.spendCurrent += 2; shock(s, { growth: -1.5, months: 4 }); s.moods.genc -= 8; s.moods.esnaf -= 6; s.moods.isci += 3; s.unemp = clamp(s.unemp - 1.2, 3, 30); } },
    { id: 'bonds', name: 'Savaş tahvili çıkar', icon: '📜', once: true, cost: 'Borç/GSYH +6 puan',
      desc: 'Halktan borçlanarak cepheyi finanse edin. Rezervler +12 milyar $, halk katkı vermekten gurur duyar.',
      apply: (s) => { s.war.bonds = true; s.debt += 6; s.reserves += 12; SEG(s, 2); s.war.front += 4; } },
    { id: 'allies', name: 'Müttefiklerden yardım iste', icon: '🤝', once: true, cost: 'Güvenilirlik 45 ve üzeri gerekir',
      desc: 'Silah, istihbarat ve kredi. Güvenilirliğiniz düşükse kapılar kapalı kalır.', cond: s => s.cred >= 45,
      apply: (s) => { s.war.allies = true; s.reserves += 15; shock(s, { cds: -60, months: 3 }); } },
    { id: 'martial', name: 'Sıkıyönetim ve fiyat kontrolü', icon: '🚧', once: true, cost: 'Güvenilirlik −6, esnaf −10',
      desc: 'Karaborsa ve stokçuluğa karşı sert önlemler. Enflasyon 4 ay boyunca baskılanır, cephe gerisi düzen sağlanır.',
      apply: (s) => { s.war.martial = true; shock(s, { infl: -0.35, months: 4 }); s.cred -= 6; s.moods.esnaf -= 10; s.anger = clamp(s.anger - 5, 0, 100); s.war.front += 2; } },
    { id: 'civil', name: 'Sivil savunma ve sığınak programı', icon: '🛡️', once: true, cost: 'Yatırım harcaması +1 puan',
      desc: 'Sirenler, sığınaklar, tahliye planları. Kayıplar yarıya iner, halkın morali korunur.',
      apply: (s) => { s.war.civil = true; s.policy.invest += 1; SEG(s, 3); } },
    { id: 'ceasefire', name: 'Ateşkes teklif et', icon: '🕊️', once: true, cost: 'Cephe durumuna göre sonuç değişir',
      desc: 'Cephe lehinizeyse onurlu barış; aleyhinizeyse düşman toprak ve tazminat ister.', cond: s => s.war.month >= 2,
      apply: (s) => { s.war.ceasefireAsked = true; } },
  ];

  function applyAction(state, id, rng) {
    const a = ACTIONS.find(x => x.id === id); if (!a || !state.war) return null;
    if (state.war[id + 'Used']) return null;
    if (a.cond && !a.cond(state)) return null;
    state.war[id + 'Used'] = true;
    a.apply(state, rng);
    state.war.log.push({ turn: state.turn, text: a.name });
    if (id === 'ceasefire') return resolveCeasefire(state);
    return a;
  }

  function resolveCeasefire(state) {
    const w = state.war;
    if (w.front >= 10) return endWar(state, 'zafer', 'Düşman ateşkesi kabul etti; cephe lehinizdeydi.');
    if (w.front > -25) return endWar(state, 'ateskes', 'Karşılıklı ateşkes: sınırlar eski yerinde kaldı.');
    return endWar(state, 'yenilgi', 'Düşman ateşkes için tazminat ve toprak istedi; kabul etmek zorunda kaldınız.');
  }

  /** Aylık savaş adımı (Model.step içinden) */
  function step(state, rng, diff) {
    const w = state.war; if (!w || !w.active) return null;
    w.month++;
    const pw = power(state);
    const ratio = pw / w.enemy;
    // cephe: güç oranı belirler, rastgelelik ekler
    const move = (ratio - 1) * 22 + rng.noise(9) + (w.mobilized ? 1.5 : 0);
    w.front = clamp(w.front + move, -100, 100);
    // kayıplar (bin kişi): düşman baskısı, savunma ve sivil savunma
    const pressure = Math.max(0, w.enemy - pw * 0.9);
    let cas = 1.5 + pressure / 9 + rng() * 1.5;
    if (w.civil) cas *= 0.5;
    w.casualties += cas;
    w.lastCasualties = cas;
    // ekonomik yük
    const burden = 0.9 + pressure / 60;
    state.growth -= 0.35 * burden;
    state.infl += 0.25 * burden;
    state.fx *= 1 + 0.9 * burden / 100;
    state.reserves -= 1.8 * burden;
    state.cds += 25 * burden;
    // halk: kayıplar moral bozar, zafer haberleri toparlar
    const morale = (w.front > 0 ? 0.6 : -0.9) - cas * 0.35;
    SEG(state, morale);
    state.anger = clamp(state.anger + cas * 0.5 - (w.front > 20 ? 1.5 : 0), 0, 100);
    w.power = pw; w.ratio = ratio;
    // bitiş
    if (w.front >= 100) return endWar(state, 'zafer', 'Ordunuz düşman başkentine dayandı; düşman teslim oldu.');
    if (w.front <= -100) return endWar(state, pw < w.enemy * 0.45 ? 'isgal' : 'yenilgi', 'Cephe çöktü.');
    if (w.month >= w.duration) {
      if (w.front >= 25) return endWar(state, 'zafer', 'Savaş sonunda üstünlük sizdeydi; düşman barış istedi.');
      if (w.front <= -25) return endWar(state, pw < w.enemy * 0.45 ? 'isgal' : 'yenilgi', 'Savaş kaybedildi.');
      return endWar(state, 'ateskes', 'Uzun bir yıpratma savaşından sonra ateşkes imzalandı.');
    }
    return { type: 'devam' };
  }

  function endWar(state, outcome, why) {
    const w = state.war; w.active = false; w.outcome = outcome; w.why = why; w.endTurn = state.turn;
    state.warHistory = (state.warHistory || []).concat([{ outcome, enemy: w.enemy, casualties: Math.round(w.casualties), months: w.month, startTurn: w.startTurn }]);
    // seferberlik geri alınır
    if (w.mobilized) state.policy.spendCurrent = Math.max(14, state.policy.spendCurrent - 2);
    if (w.civil) state.policy.invest = Math.max(1, state.policy.invest - 1);
    switch (outcome) {
      case 'zafer':
        state.support = clamp(state.support + 16, 0, 100); state.cred += 8; state.reserves += 8; state.anger = clamp(state.anger - 15, 0, 100);
        SEG(state, 14); shock(state, { cds: -110, growth: 0.6, months: 6 }); state.score += 320; break;
      case 'ateskes':
        state.support = clamp(state.support - 2, 0, 100); SEG(state, 1); shock(state, { cds: -40, months: 3 }); state.score += 60; break;
      case 'yenilgi':
        state.debt += 10; state.reserves -= 12; state.cred -= 9; SEG(state, -16); state.anger = clamp(state.anger + 18, 0, 100);
        shock(state, { growth: -1.6, cds: 80, months: 6 }); state.score -= 320; break;
      case 'isgal':
        state.gameOver = { type: 'isgal', title: 'Ülken işgal edildi ve seni astılar', text: 'Savunma ve teknolojiye yeterli yatırım yapılmamıştı: ordu dağıldı, düşman birlikleri başkente girdi. İşgal kuvvetleri seni göstermelik bir mahkemede yargıladı ve Meclis meydanında astı. Ülke tarihe, sen ibret olarak geçtin.' };
        state.score -= 500; break;
    }
    state.support = clamp(Object.keys(state.moods).reduce((a, k) => a + state.moods[k] * (Model.SEGMENTS.find(s => s.id === k).share), 0), 0, 100);
    return { type: outcome, why };
  }

  const OUTCOME_TEXT = {
    zafer: { icon: '🏅', title: 'Zafer!', text: 'Ordunuz cepheyi tuttu ve düşmanı püskürttü. Meydanlar bayraklarla doldu, dünya basını "hazırlıklı ülke" manşetleri atıyor. Kamuoyu desteği ve güvenilirlik sıçradı.' },
    ateskes: { icon: '🕊️', title: 'Ateşkes', text: 'İki taraf da kesin sonuç alamadı. Sınırlar eski yerinde; yaralar sarılmaya, ekonomi toparlanmaya başlıyor.' },
    yenilgi: { icon: '🏳️', title: 'Yenilgi', text: 'Savunma hazırlığı yetersiz kaldı. Tazminat ve toprak kaybıyla biten barış halkı yasa boğdu; borç yükseldi, güvenilirlik sarsıldı.' },
    isgal: { icon: '💀', title: 'İşgal', text: 'Ordu dağıldı ve başkent düştü. İşgal kuvvetleri yönetimi devraldı.' },
  };

  global.War = { accumulate, power, shouldDeclare, declare, step, ACTIONS, applyAction, OUTCOME_TEXT };
  if (typeof module !== 'undefined') module.exports = global.War;
})(typeof window !== 'undefined' ? window : globalThis);
