/* ===========================================================
   ÜLKEYİ YÖNET — Ekonomi Modeli
   Aylık adımlarla çalışan basitleştirilmiş makro model.
   Tüm oranlar yıllık % cinsindendir (aksi belirtilmedikçe).
   =========================================================== */
(function (global) {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // --- Basit deterministik rastgele sayı üreteci (kayıt/yükleme için) ---
  function makeRng(seed) {
    let s = seed >>> 0 || 123456789;
    const rng = function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
    rng.seed = () => s;
    rng.range = (a, b) => a + (b - a) * rng();
    rng.noise = (amp) => (rng() - 0.5) * 2 * amp;
    return rng;
  }

  const DIFFICULTIES = {
    kolay: { label: 'Kolay', shockProb: 0.07, shockMult: 0.55, desc: 'Az şok, yumuşak etkiler. Öğrenmek için ideal.' },
    orta: { label: 'Orta', shockProb: 0.11, shockMult: 0.8, desc: 'Gerçekçi şok sıklığı ve etkisi.' },
    zor: { label: 'Zor', shockProb: 0.17, shockMult: 1.0, desc: 'Sık ve sert şoklar. Uzmanlar için.' },
  };

  const BASE_FISCAL = { directTax: 18, indirectTax: 18, spendCurrent: 22, invest: 5, transfers: 8 };

  const SCENARIOS = [
    {
      id: 'sakin', title: 'Sakin Sular', tag: 'Kolay', icon: '🌤️', year: 2030, month: 1,
      desc: 'Enflasyon tek hanede, büyüme dengeli, halk iyimser. Bu istikrarı dört yıl boyunca koruyabilir misiniz? Sürprizler yine de kapıda olabilir.',
      gdpUsd: 1000, breadBase: 5,
      state: { infl: 8.0, core: 7.5, exp: 8.0, target: 5, growth: 4.0, potential: 4.0, unemp: 9.0, fx: 20, reserves: 140, cds: 240, globalRate: 2.5, debt: 35, ca: -2.0, cred: 60, rate: 12, rr: 8, rrFx: 15 },
    },
    {
      id: 'kaynak', title: 'Kaynak Laneti', tag: 'Kolay', icon: '🛢️', year: 2029, month: 3,
      desc: 'Petrol ve gaz geliri kasayı doldurdu: rezerv dev, cari fazla var, borç yok. Ama sanayi cılız, gençler işsiz ve herkes devletten maaş bekliyor. Zenginliği kalıcı büyümeye çevirin.',
      gdpUsd: 600, breadBase: 4,
      state: { infl: 6.5, core: 6.0, exp: 7.0, target: 4, growth: 1.5, potential: 2.5, unemp: 14.0, fx: 8, reserves: 320, cds: 160, globalRate: 3.0, debt: 12, ca: 5.0, cred: 55, rate: 9, rr: 6, rrFx: 10 },
      policy: { spendCurrent: 25, transfers: 10, invest: 3 },
    },
    {
      id: 'dezenflasyon', title: '2026: Dezenflasyon Yolu', tag: 'Orta', icon: '📉', year: 2026, month: 10,
      desc: 'Enflasyon yavaş da olsa düşüyor ama hizmet fiyatları inatçı. Rezervler toparlandı, dünyada faizler yeniden yükseliyor. Dezenflasyonu sürdürmek ve halkı yanınızda tutmak sizde.',
      gdpUsd: 1400, breadBase: 15,
      state: { infl: 31.5, core: 30.1, exp: 27.0, target: 12, growth: 2.3, potential: 4.0, unemp: 8.1, fx: 48.48, reserves: 186.7, cds: 217, globalRate: 3.88, debt: 42, ca: -2.3, cred: 45, rate: 37, rr: 8, rrFx: 20 },
    },
    {
      id: 'kriz2008', title: '2008: Küresel Fırtına', tag: 'Orta', icon: '🌊', year: 2008, month: 10,
      desc: 'Lehman battı, dünya ticareti çöküyor. İhracat siparişleri iptal, sanayi üretimi düşüşte, işsizlik tırmanıyor. Dünya faizleri sıfıra inerken siz de gevşeyebilir misiniz, yoksa kur sizi durdurur mu?',
      gdpUsd: 730, breadBase: 0.75,
      state: { infl: 11.5, core: 10.0, exp: 9.5, target: 5, growth: 1.0, potential: 4.5, unemp: 10.3, fx: 1.5, reserves: 72, cds: 480, globalRate: 1.5, debt: 40, ca: -5.5, cred: 55, rate: 16.75, rr: 6, rrFx: 9 },
      shocks: [{ growth: -1.8, months: 8 }, { cds: 60, fx: 1.0, months: 4 }, { globalRate: -0.2, months: 5 }],
      firstEvent: 'resesyon',
    },
    {
      id: 'kursoku', title: '2018: Kur Fırtınası', tag: 'Zor', icon: '🌪️', year: 2018, month: 4,
      desc: 'Ekonomi hızlı büyüdü ama ısındı: cari açık büyük, enflasyon çift hanede, rezervler zayıf ve kur tedirgin. Yaz aylarında bir kur fırtınası kapıda olabilir. Hazırlıklı olun.',
      gdpUsd: 800, breadBase: 1.25,
      state: { infl: 10.2, core: 10.5, exp: 11.5, target: 5, growth: 7.3, potential: 4.5, unemp: 10.5, fx: 3.88, reserves: 98, cds: 190, globalRate: 2.0, debt: 30, ca: -6.0, cred: 38, rate: 12.75, rr: 8, rrFx: 12 },
    },
    {
      id: 'stagflasyon', title: '2022: Negatif Reel Faiz', tag: 'Zor', icon: '🔥', year: 2022, month: 1,
      desc: 'Enflasyon %49, politika faizi %14: reel faiz derin negatif. Kur son iki ayda ikiye katlandı, halk döviz ve altına kaçıyor. Ortodoks yola dönmek acı verecek; dönmemek daha da acı.',
      gdpUsd: 820, breadBase: 4,
      state: { infl: 48.7, core: 39.5, exp: 45.0, target: 5, growth: 9.0, potential: 4.0, unemp: 11.2, fx: 13.5, reserves: 70, cds: 560, globalRate: 0.25, debt: 42, ca: -2.0, cred: 22, rate: 14, rr: 8, rrFx: 22 },
      shocks: [{ globalRate: 0.35, months: 8 }, { infl: 0.4, months: 4 }],
    },
    {
      id: 'kriz2001', title: '2001: Kara Şubat', tag: 'Çok Zor', icon: '💥', year: 2001, month: 3,
      desc: 'Sabit kur çöktü, bankalar battı, gecelik faiz binlerce puanı gördü. Rezerv yok, güven yok, borç dağ gibi. Elinizde IMF telefonu ve öfkeli bir halk var. Ekonomiyi küllerinden yeniden kurun.',
      gdpUsd: 200, breadBase: 0.15,
      state: { infl: 55.0, core: 50.0, exp: 62.0, target: 20, growth: -5.5, potential: 4.5, unemp: 9.0, fx: 1.0, reserves: 22, cds: 950, globalRate: 5.0, debt: 75, ca: 0.5, cred: 18, rate: 60, rr: 6, rrFx: 11 },
      shocks: [{ growth: -1.5, months: 4 }, { cds: 100, months: 3 }],
      firstEvent: 'banka',
    },
    {
      id: 'hiper', title: 'Hiperenflasyon Eşiği', tag: 'Çok Zor', icon: '☢️', year: 2028, month: 6,
      desc: 'Fiyatlar her ay %7 artıyor, maaşlar aynı hafta eriyor, dükkânlar etiket basmaya yetişemiyor. Bir yanlış adımda para birimi kâğıt olur. Beklentileri kırmadan bu iş bitmez.',
      gdpUsd: 500, breadBase: 60,
      state: { infl: 88.0, core: 80.0, exp: 95.0, target: 15, growth: 1.5, potential: 3.5, unemp: 12.5, fx: 140, reserves: 35, cds: 780, globalRate: 3.5, debt: 58, ca: -3.5, cred: 12, rate: 55, rr: 10, rrFx: 25 },
      shocks: [{ infl: 0.6, months: 3 }],
      policy: { transfers: 10, indirectTax: 16 },
    },
  ];

  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  // Halk kesimleri (nüfus payları toplamı 1)
  const SEGMENTS = [
    { id: 'isci', name: 'İşçiler', share: 0.30, color: '#e07a2f' },
    { id: 'emekli', name: 'Emekliler', share: 0.15, color: '#8c8c9c' },
    { id: 'esnaf', name: 'Esnaf ve İş Dünyası', share: 0.14, color: '#3b6fb6' },
    { id: 'ciftci', name: 'Çiftçiler', share: 0.10, color: '#5a9e4b' },
    { id: 'memur', name: 'Memurlar', share: 0.13, color: '#7c5cbf' },
    { id: 'genc', name: 'Gençler', share: 0.18, color: '#d8467a' },
  ];

  // Programlar (aç/kapa)
  const PROGRAMS = [
    { id: 'gaz', name: 'Doğalgaz ve Elektrik Sübvansiyonu', icon: '🔥', cost: 0.6, desc: 'Faturalar baskılanır: enflasyon yavaşlar, hane halkı rahatlar. Bütçeye yük bindirir.' },
    { id: 'gidaKdv', name: 'Gıdada KDV İndirimi', icon: '🥖', cost: 0.4, desc: 'Temel gıdada vergi sıfırlanır. Enflasyona küçük ama görünür destek, gelir kaybı.' },
    { id: 'konut', name: 'Sosyal Konut Seferberliği', icon: '🏗️', cost: 0.8, desc: 'Kamu konut yatırımı: inşaat canlanır, gençler umutlanır, büyüme artar. Borç yükselir.' },
    { id: 'istihdam', name: 'Genç İstihdam Teşviki', icon: '👷', cost: 0.5, desc: 'İşverene prim desteği: işsizlik düşer, gençler ve esnaf memnun olur.' },
    { id: 'tarim', name: 'Çiftçiye Mazot ve Gübre Desteği', icon: '🌾', cost: 0.3, desc: 'Tarım girdileri sübvanse edilir: gıda fiyatları ve çiftçi tepkisi yumuşar.' },
    { id: 'tasarruf', name: 'Kamuda Tasarruf Paketi', icon: '✂️', cost: -0.7, desc: 'Makam araçları, temsil giderleri kesilir. Bütçe rahatlar; memurlar ve halk kısmen tedirgin olur.' },
  ];

  function createState(scenarioId, difficultyId, seed) {
    const sc = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0];
    const s = sc.state;
    const state = {
      scenarioId: sc.id, difficulty: difficultyId || 'orta', seed: seed || Math.floor(Math.random() * 1e9),
      turn: 0, termMonths: 48, year: sc.year, month: sc.month, // month: 1-12
      gdpUsd: sc.gdpUsd, breadBase: sc.breadBase, priceIndex: 1,
      infl: s.infl, core: s.core, exp: s.exp, target: s.target,
      growth: s.growth, potential: s.potential, gap: 0, unemp: s.unemp, natural: 8.0,
      fx: s.fx, fxPrev: s.fx, depMonthly: 0, reserves: s.reserves, cds: s.cds, globalRate: s.globalRate,
      debt: s.debt, deficit: 0, ca: s.ca, cred: s.cred,
      support: 55, anger: 35, moods: {},
      policy: {
        rate: s.rate, rr: s.rr, rrFx: s.rrFx, comm: 0, guidance: 'belirsiz', intervention: 0, creditStd: 0,
        directTax: 18, indirectTax: 18, spendCurrent: 22, invest: 5, transfers: 8, minWageRaise: null,
      },
      prevPolicy: null, programs: {}, shocks: [], flags: {}, history: [], events: [], newsLog: [],
      gameOver: null, score: 0, lastReport: null,
    };
    PROGRAMS.forEach(p => state.programs[p.id] = false);
    if (sc.policy) Object.assign(state.policy, sc.policy);
    if (sc.shocks) state.shocks = sc.shocks.map(x => Object.assign({}, x));
    state.prevPolicy = JSON.parse(JSON.stringify(state.policy));
    recomputeDerived(state);
    state.moods = segmentTargets(state);
    state.support = SEGMENTS.reduce((a, seg) => a + state.moods[seg.id] * seg.share, 0);
    state.anger = clamp(100 - state.support, 0, 100);
    pushHistory(state);
    return state;
  }

  function reserveCoverMonths(state) {
    const importsMonthly = state.gdpUsd * 0.30 / 12;
    return state.reserves / importsMonthly;
  }

  function programCost(state) {
    let c = 0;
    PROGRAMS.forEach(p => { if (state.programs[p.id]) c += p.cost; });
    return c;
  }

  function recomputeDerived(state) {
    const p = state.policy;
    state.realRate = p.rate - state.exp;
    const effRate = 0.25 * p.rate + 3; // borç üzerindeki ortalama faiz
    state.interest = state.debt * effRate / 100;
    const spending = p.spendCurrent + p.invest + p.transfers + programCost(state);
    const taxes = p.directTax + p.indirectTax;
    state.primary = taxes - spending;
    state.deficit = spending + state.interest - taxes; // % GSYH
    state.coverMonths = reserveCoverMonths(state);
    state.carry = p.rate - state.exp - state.globalRate - state.cds / 100;
    state.breadPrice = state.breadBase * state.priceIndex;
    return state;
  }

  function pushHistory(state) {
    state.history.push({
      turn: state.turn, label: `${MONTHS[state.month - 1].slice(0, 3)} ${String(state.year).slice(2)}`,
      infl: state.infl, core: state.core, exp: state.exp, growth: state.growth, unemp: state.unemp,
      fx: state.fx, reserves: state.reserves, cds: state.cds, debt: state.debt, deficit: state.deficit,
      cred: state.cred, support: state.support, rate: state.policy.rate, ca: state.ca, anger: state.anger,
    });
    if (state.history.length > 120) state.history.shift();
  }

  function segmentTargets(state) {
    const p = state.policy, m = {};
    const infl = state.infl, u = state.unemp, g = state.growth;
    const inflPain = Math.min(48, Math.max(0, infl - 10)); // aşırı enflasyonda acı doygunluğa ulaşır
    const prg = state.programs;
    m.isci = 72 - 0.7 * inflPain - 3.0 * (u - 7) + 1.2 * g + 1.5 * (p.transfers - 8) - 1.5 * (p.directTax - 20)
      + (prg.gaz ? 5 : 0) + (prg.gidaKdv ? 3 : 0) + (state.flags.minWageBonus || 0);
    m.emekli = 70 - 1.0 * inflPain + 3.0 * (p.transfers - 8) - 1.2 * (p.indirectTax - 18) + (prg.gaz ? 6 : 0) + (prg.gidaKdv ? 4 : 0);
    m.esnaf = 66 - 0.45 * (p.rate - 20) + 2.0 * g - 2.0 * (p.directTax - 20) - 0.4 * inflPain - 4 * p.creditStd
      + (prg.istihdam ? 4 : 0) - (state.flags.minWagePain || 0);
    m.ciftci = 66 - 0.6 * inflPain + 1.5 * (p.transfers - 8) - 6 * Math.max(0, state.depMonthly - 1.5)
      + (prg.tarim ? 8 : 0) + (state.flags.ciftciBonus || 0);
    m.memur = 66 - 0.8 * inflPain + 2.0 * (p.spendCurrent - 20) - (prg.tasarruf ? 6 : 0);
    m.genc = 62 - 3.5 * (u - 7) - 0.4 * inflPain + 1.0 * g + 1.5 * (p.invest - 5) + (prg.konut ? 7 : 0) + (prg.istihdam ? 6 : 0);
    Object.keys(m).forEach(k => { m[k] = clamp(m[k], 0, 100); });
    return m;
  }

  // Haber üreteci
  function makeNews(state, d) {
    const n = [];
    const p = state.policy;
    if (d.rate > 0) n.push(`Merkez Bankası faizi ${d.rate} puan artırdı: bankalar mevduat faizini güncelliyor.`);
    if (d.rate < 0) n.push(`Faiz indirimi sonrası konut kredisi başvuruları arttı.`);
    if (state.depMonthly > 3) n.push(`Döviz büfelerinde yoğunluk: kur bu ay %${state.depMonthly.toFixed(1)} yükseldi.`);
    if (state.depMonthly < -1) n.push(`TL değer kazandı; ihracatçılar kurdan şikâyetçi.`);
    if (d.infl < -0.5) n.push(`Enflasyon geriliyor: manşet %${state.infl.toFixed(1)}. Piyasalar temkinli iyimser.`);
    if (d.infl > 0.8) n.push(`Zam dalgası: pazarda domates ve kira fiyatları yeniden gündemde.`);
    if (state.unemp > 11) n.push(`İşsizlik %${state.unemp.toFixed(1)}: genç işsizliği rekor seviyede.`);
    if (state.anger > 65) n.push(`Meydanlarda protesto: "Geçinemiyoruz" sloganları yükseliyor.`);
    if (state.coverMonths < 3) n.push(`Rezervler eridi: ithalatçılar döviz bulmakta zorlanıyor.`);
    if (state.cds > 500) n.push(`CDS primi ${Math.round(state.cds)} baz puan: yabancı yatırımcı çıkışı hızlandı.`);
    if (state.growth > 6) n.push(`Fabrikalar tam kapasite: ihracat siparişleri arttı.`);
    if (state.growth < 0) n.push(`Ekonomi daralıyor; sanayi üretimi geriledi, kepenkler kapanıyor.`);
    if (state.deficit > 7) n.push(`Bütçe açığı büyüyor: Hazine borçlanma programını yeniledi.`);
    if (state.cred > 70) n.push(`Yabancı bankalar raporu: "Politika güvenilirliği geri geldi."`);
    if (p.comm === 1) n.push(`Başkan'ın şahin açıklaması manşetlerde: "Enflasyonla mücadelede taviz yok."`);
    if (p.comm === -1) n.push(`Güvercin mesajlar piyasada tartışılıyor: "Erken gevşeme riski" uyarısı.`);
    const flavor = [
      'Muhabir sordu, vatandaş cevapladı: "Maaş bitiyor ay bitmiyor."',
      'Hasat zamanı: fındık ve üzüm fiyatları ihracatçının gündeminde.',
      'Piyasalar PPK kararını bekliyor.',
      'Turizm sezonu: kıyı otellerinde doluluk yükseldi.',
      'Ekonomistler: "Beklentiler çıpalanmadan kalıcı düşüş zor."',
      'Sanayiciler: "Kredi bulmak zorlaştı" dedi.',
      'Emekliler bayram ikramiyesi için Meclis önünde.',
      'Yeni AVM açıldı; kira fiyatları tartışılıyor.',
    ];
    n.push(flavor[Math.floor((state.turn * 7 + state.month * 3) % flavor.length)]);
    return n;
  }

  /**
   * Bir ay ilerlet. Politika değişikliklerini, şokları ve halk tepkisini işler.
   * Geriye o ayın raporunu döndürür.
   */
  function step(state, rng) {
    rng = rng || makeRng(state.seed + state.turn * 7919);
    const p = state.policy, prev = state.prevPolicy;
    const diff = DIFFICULTIES[state.difficulty] || DIFFICULTIES.orta;
    const before = snapshot(state);
    const notes = [];

    // ---------- 0. Politika değişimlerinin anlık/güvenilirlik etkileri ----------
    const dRate = p.rate - prev.rate;
    if (p.guidance === 'siki' && dRate < 0 && prev.guidance === 'siki') { state.cred -= 6; notes.push('İleri yönlendirmeye aykırı faiz indirimi: güvenilirlik sarsıldı.'); }
    if (p.guidance === 'gevseme' && dRate > 0 && prev.guidance === 'gevseme') { state.cred -= 3; }
    if (Math.abs(dRate) >= 10) { state.cred -= 3; notes.push('Sert faiz hamlesi piyasayı şaşırttı.'); }
    if (dRate < 0 && state.infl > state.exp + 4 && state.realRate < 2) { state.cred -= 2; notes.push('Enflasyon yüksekken indirim: "erken gevşeme" eleştirisi.'); }
    if (dRate > 0 && state.infl > state.target + 5) { state.cred += 1.0; }

    const dInd = p.indirectTax - prev.indirectTax;
    if (dInd !== 0) { state.infl += 0.45 * dInd; state.core += 0.3 * dInd; notes.push(dInd > 0 ? 'Dolaylı vergi zammı fiyatlara yansıdı.' : 'Vergi indirimi etiketlere yansıdı.'); }

    // ---------- 1. Temel değişkenler ----------
    const fiscalImpulse = 0.6 * (p.spendCurrent - BASE_FISCAL.spendCurrent) + 1.0 * (p.invest - BASE_FISCAL.invest)
      + 0.8 * (p.transfers - BASE_FISCAL.transfers) - 0.5 * (p.directTax - BASE_FISCAL.directTax) - 0.4 * (p.indirectTax - BASE_FISCAL.indirectTax)
      + (state.programs.konut ? 0.8 : 0) + (state.programs.istihdam ? 0.3 : 0) + (state.programs.tasarruf ? -0.3 : 0);
    const realRate = p.rate - state.exp;
    const neutralReal = 3;
    let shockG = 0, shockI = 0, shockFx = 0, shockCds = 0, shockRes = 0, shockSup = 0, shockGlobal = 0;
    state.shocks = state.shocks.filter(s => s.months > 0);
    state.shocks.forEach(s => {
      shockG += s.growth || 0; shockI += s.infl || 0; shockFx += s.fx || 0; shockCds += s.cds || 0;
      shockRes += s.reserves || 0; shockSup += s.support || 0; shockGlobal += s.globalRate || 0; s.months--;
    });

    // Büyüme
    const inflDrag = 0.04 * Math.max(0, state.infl - 25);
    const credConf = 0.01 * (state.cred - 50);
    const gTarget = state.potential - 3.6 * Math.tanh((realRate - neutralReal) / 16) + 0.5 * fiscalImpulse - 0.12 * (p.rr - 8)
      - 0.6 * p.creditStd - inflDrag + credConf + shockG + 0.15 * (state.depMonthly > 4 ? -state.depMonthly : 0);
    state.growth += 0.22 * (gTarget - state.growth) + rng.noise(0.15);
    state.growth = clamp(state.growth, -12, 14);
    state.gap = state.gap * 0.96 + (state.growth - state.potential) / 12;
    state.potential += 0.012 * (p.invest - 5) / 12 + (state.programs.konut ? 0.005 : 0);
    state.potential = clamp(state.potential, 1.5, 6.5);

    // İşsizlik
    const uTarget = state.natural - 0.55 * state.gap + (state.programs.istihdam ? -0.6 : 0);
    state.unemp += 0.12 * (uTarget - state.unemp) - 0.35 * (state.growth - state.potential) / 12 + rng.noise(0.05);
    state.unemp = clamp(state.unemp, 3, 30);

    // Küresel faiz
    state.globalRate = clamp(state.globalRate + shockGlobal + (rng() < 0.15 ? rng.noise(0.25) : 0), 0, 9);

    // Kur
    const ppp = (state.exp - 2.5) / 12;
    const carry = (p.rate - state.exp - state.globalRate - state.cds / 100) / 12;
    const sentiment = -(state.cred - 50) / 50 * 0.35 + (p.comm === -1 ? 0.12 : 0) - (p.comm === 1 ? 0.06 : 0);
    const intervEffect = p.intervention * 0.32; // pozitif = satış
    let dep = ppp - 0.85 * carry + sentiment + shockFx * diff.shockMult - intervEffect + rng.noise(0.7);
    if (state.coverMonths < 3) dep += 0.8; // rezerv zayıflığı primi
    dep = clamp(dep, -8, 25);
    state.depMonthly = dep;
    state.fxPrev = state.fx;
    state.fx = state.fx * (1 + dep / 100);

    // Rezervler
    const caFlow = state.ca * state.gdpUsd / 100 / 12;
    const portfolio = 0.8 * (p.rate - state.exp - state.globalRate - state.cds / 100) + 0.25 * (state.cred - 50) / 10;
    state.reserves += caFlow + clamp(portfolio, -8, 6) - p.intervention + shockRes * diff.shockMult + rng.noise(0.5);
    if (p.intervention > 0 && state.coverMonths < 4) state.cred -= 0.12 * p.intervention;
    state.reserves = Math.max(-40, state.reserves);

    // Cari denge (kur ve büyüme ile)
    const caTarget = -1.0 - 0.5 * (state.growth - 3) + 0.8 * Math.log(Math.max(0.2, state.fx / state.history[0].fx)) * 2 - 0.15 * Math.max(0, state.gap);
    state.ca += 0.1 * (caTarget - state.ca);

    // Enflasyon
    const fxPass = dep * 0.22;
    const demand = 0.07 * state.gap;
    const expPull = 0.11 * (state.exp - state.infl);
    // Faizin etkisi enflasyon düşükken zayıflar (sıfır alt sınırı benzeri)
    const rateEff = -0.045 * (realRate - neutralReal) * (state.infl / (state.infl + 8));
    const supply = shockI * diff.shockMult;
    const programEff = (state.programs.gaz ? -0.12 : 0) + (state.programs.gidaKdv ? -0.08 : 0) + (state.programs.tarim ? -0.04 : 0) + (state.flags.minWageInfl || 0);
    state.infl += expPull + demand + fxPass + rateEff + supply + programEff + rng.noise(0.25);
    state.infl = clamp(state.infl, 0.5, 250);
    state.core += 0.1 * (state.exp - state.core) + demand + 0.5 * fxPass + rateEff + 0.4 * supply + rng.noise(0.15);
    state.core = clamp(state.core, 0.5, 250);
    state.priceIndex *= 1 + state.infl / 100 / 12;

    // Beklentiler
    const anchor = (state.cred / 100) * 0.05 * (state.target - state.exp);
    const commEff = p.comm === 1 ? -0.25 * (state.cred / 100) : (p.comm === -1 ? 0.25 : 0);
    const guideEff = (p.guidance === 'siki' && state.cred > 40) ? -0.12 : (p.guidance === 'gevseme' ? 0.1 : 0);
    state.exp += 0.16 * (state.infl - state.exp) + anchor + commEff + guideEff;
    state.exp = clamp(state.exp, 1, 250);

    // Güvenilirlik (yavaş birikim)
    if (realRate > 2 && state.infl < before.infl) state.cred += 0.5 + 0.6 * Math.min(1, (realRate - 2) / 20);
    if (realRate < -3) state.cred -= 0.5;
    if (state.infl < state.target + 2) state.cred += 0.3;
    if (state.depMonthly > 6) state.cred -= 0.8;
    state.cred += 0.02 * (50 - state.cred);
    state.cred = clamp(state.cred, 0, 100);

    // Mali denge & borç
    recomputeDerived(state);
    const nominalGrowth = state.growth + state.infl;
    state.debt += state.deficit / 12 - state.debt * nominalGrowth / 100 / 12 + 0.55 * state.debt * dep / 100;
    state.debt = clamp(state.debt, 5, 250);

    // CDS
    const cdsTarget = 140 + 3 * Math.max(0, state.infl - 10) + 4 * Math.max(0, state.debt - 40) + 2.2 * (50 - state.cred)
      + 70 * Math.max(0, 4 - state.coverMonths) + 2.5 * Math.max(0, state.anger - 50) + 25 * Math.max(0, state.deficit - 5) + shockCds * diff.shockMult;
    state.cds += 0.25 * (cdsTarget - state.cds) + rng.noise(6);
    state.cds = clamp(state.cds, 40, 2500);

    // ---------- 2. Halk ----------
    if (state.flags.minWageBonus) state.flags.minWageBonus *= 0.85;
    if (state.flags.minWagePain) state.flags.minWagePain *= 0.85;
    if (state.flags.minWageInfl) state.flags.minWageInfl *= 0.7;
    if (state.flags.ciftciBonus) state.flags.ciftciBonus *= 0.8;
    const targets = segmentTargets(state);
    let support = 0;
    SEGMENTS.forEach(seg => {
      const t = targets[seg.id] + shockSup;
      state.moods[seg.id] = clamp(state.moods[seg.id] + 0.22 * (t - state.moods[seg.id]) + rng.noise(0.6), 0, 100);
      support += state.moods[seg.id] * seg.share;
    });
    state.support = clamp(support, 0, 100);
    const inflSurprise = Math.max(0, state.infl - before.infl) * 4;
    const angerTarget = 100 - state.support + inflSurprise + (state.unemp > 12 ? 8 : 0);
    state.anger = clamp(state.anger + 0.3 * (angerTarget - state.anger), 0, 100);

    // ---------- 3. Zaman ----------
    state.turn++;
    state.month++;
    if (state.month > 12) { state.month = 1; state.year++; }
    state.policy.intervention = 0; // müdahale tek aylık
    state.prevPolicy = JSON.parse(JSON.stringify(state.policy));
    recomputeDerived(state);
    pushHistory(state);

    // ---------- 4. Skor & oyun sonu ----------
    state.score += monthlyScore(state);
    checkGameOver(state);

    const after = snapshot(state);
    const d = {};
    Object.keys(after).forEach(k => d[k] = after[k] - before[k]);
    d.rate = dRate;
    const news = makeNews(state, d);
    state.newsLog = news.concat(state.newsLog).slice(0, 12);
    state.lastReport = { before, after, delta: d, notes, news, turn: state.turn };
    return state.lastReport;
  }

  function snapshot(s) {
    return { infl: s.infl, core: s.core, exp: s.exp, growth: s.growth, unemp: s.unemp, fx: s.fx, reserves: s.reserves, cds: s.cds, debt: s.debt, deficit: s.deficit, cred: s.cred, support: s.support, ca: s.ca, anger: s.anger };
  }

  function monthlyScore(s) {
    let sc = 85;
    sc -= 3.0 * Math.min(25, Math.max(0, s.infl - s.target));
    const startInfl = s.history.length ? s.history[0].infl : s.infl;
    sc += Math.min(60, 1.2 * Math.max(0, startInfl - s.infl)); // ilerleme primi
    sc -= 7 * Math.min(10, Math.max(0, s.unemp - 8));
    sc += 4 * clamp(s.growth, -5, 6);
    sc += 0.5 * (s.support - 50);
    sc += 0.3 * (s.cred - 50);
    sc -= 0.03 * Math.max(0, s.cds - 250);
    const scen = SCENARIOS.find(x => x.id === s.scenarioId);
    const tagMult = { 'Kolay': 0.9, 'Orta': 1.0, 'Zor': 1.2, 'Çok Zor': 1.5 }[scen ? scen.tag : 'Orta'] || 1;
    const diffMult = { kolay: 0.9, orta: 1.0, zor: 1.15 }[s.difficulty] || 1;
    return Math.round(clamp(sc, -50, 130) * tagMult * diffMult);
  }

  function checkGameOver(s) {
    if (s.gameOver) return;
    if (s.support < 15 && s.turn >= 6) s.gameOver = { type: 'istifa', title: 'Halk sokağa döküldü', text: 'Kamuoyu desteği çöktü. Meydanlar doldu, koalisyon dağıldı ve istifanız istendi. Görev süreniz erken bitti.' };
    else if (s.infl > 150) s.gameOver = { type: 'hiper', title: 'Hiperenflasyon', text: 'Fiyatlar kontrolden çıktı. Para birimine güven kalmadı; ekonomi dolarize oldu. Yönetim el değiştirdi.' };
    else if (s.reserves < -20) s.gameOver = { type: 'temerrut', title: 'Dış borç krizi', text: 'Rezervler tükendi, ithalat durdu, IMF kapısı çalındı. Ekonomi yönetimi görevden alındı.' };
    else if (s.turn >= s.termMonths) {
      const won = s.support >= 50;
      s.gameOver = { type: won ? 'secim_zafer' : 'secim_yenilgi', title: won ? 'Seçim Zaferi!' : 'Seçimi kaybettiniz',
        text: won ? 'Dört yılın sonunda halk sizi yeniden seçti. İstikrar programınız tarihe geçti.' : 'Dört yıl doldu ama halkın çoğunluğu değişim istedi. Yine de bıraktığınız miras önemli.' };
    }
  }

  function grade(state) {
    const sc = state.score / Math.max(1, state.turn);
    if (sc >= 90) return 'S';
    if (sc >= 75) return 'A';
    if (sc >= 55) return 'B';
    if (sc >= 35) return 'C';
    if (sc >= 15) return 'D';
    return 'F';
  }

  // Asgari ücret kararı (Ocak & Temmuz)
  function applyMinWage(state, pct) {
    const gapVsInfl = pct - state.infl;
    state.flags.minWageBonus = clamp(4 + 0.5 * gapVsInfl, -8, 14);
    state.flags.minWagePain = clamp(2 + 0.35 * gapVsInfl, -4, 12);
    state.flags.minWageInfl = clamp(0.02 * Math.max(0, gapVsInfl) + 0.05, 0, 0.9);
    state.policy.minWageRaise = pct;
  }

  global.Model = {
    makeRng, clamp, DIFFICULTIES, SCENARIOS, MONTHS, SEGMENTS, PROGRAMS, BASE_FISCAL,
    createState, step, recomputeDerived, checkGameOver, grade, applyMinWage, segmentTargets, reserveCoverMonths,
  };
  if (typeof module !== 'undefined') module.exports = global.Model;
})(typeof window !== 'undefined' ? window : globalThis);
