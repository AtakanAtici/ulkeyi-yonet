/* ===========================================================
   ÜLKEYİ YÖNET — Darbe modülü
   Halk desteği çöker, öfke ve enflasyon tırmanır ya da ordu ihmal edilirse
   darbe riski yükselir. Girişim gelirse üç yol var: direniş, pazarlık, uluslararası destek.
   =========================================================== */
(function (global) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SEG = (s, d) => Object.keys(s.moods).forEach(k => s.moods[k] = clamp(s.moods[k] + d, 0, 100));
  const shock = (s, o) => s.shocks.push(Object.assign({ months: 3 }, o));

  /** 0-100 arası darbe riski; her ay hesaplanır */
  function risk(state) {
    const p = state.policy;
    let r = 0;
    r += 1.0 * Math.max(0, 45 - state.support);
    r += 0.5 * Math.max(0, state.anger - 55);
    r += 0.25 * Math.max(0, state.infl - 40);
    r += 2.5 * Math.max(0, state.unemp - 12);
    r += p.defense < 1.5 ? 10 : 0;                       // ihmal edilen ordu
    r += (state.warHistory || []).some(w => w.outcome === 'yenilgi') ? 12 : 0;
    r -= 0.25 * (state.cred - 50);
    r -= state.flags.vesayet ? 20 : 0;                    // ordu zaten söz sahibi
    if (state.war && state.war.active) r -= 15;           // savaşta ordu cephede
    return clamp(r, 0, 100);
  }

  function shouldAttempt(state, rng) {
    if (state.turn < 6 || (state.war && state.war.active)) return false;
    if (state.flags.coupCooldown && state.turn < state.flags.coupCooldown) return false;
    const r = state.coupRisk || 0;
    if (r < 30) return false;
    const diffMult = { kolay: 0.6, orta: 1, zor: 1.4 }[state.difficulty] || 1;
    return rng() < ((r - 30) / 100) * 0.55 * diffMult;
  }

  /** Seçim sonucu; state.flags.coupResult'a yazılır, arayüz gösterir */
  function resolve(state, choice, rng) {
    rng = rng || Math.random;
    const r = state.coupRisk || 50;
    let success = false, text = '', title = '';
    if (choice === 'resist') {
      const chance = clamp(0.35 + (state.support - 35) / 60 + (state.cred - 50) / 200 - (r - 50) / 250, 0.08, 0.92);
      success = rng() < chance;
      if (success) {
        title = 'Halk tankların önüne dikildi';
        text = `Meydanlar gece yarısı doldu; askerler kalabalığa ateş açmadı, darbeciler sabaha kalmadan teslim oldu. Demokrasi kazandı. Başarı şansı %${Math.round(chance * 100)} idi.`;
        state.support = clamp(state.support + 12, 0, 100); state.cred += 6; state.anger = clamp(state.anger - 14, 0, 100); SEG(state, 10);
        shock(state, { cds: -50, months: 3 }); state.flags.coupCooldown = state.turn + 18; state.score += 200;
      } else {
        title = 'Direniş kırıldı';
        text = `Sokağa çıkan kalabalık dağıtıldı, Meclis kuşatıldı. Başarı şansı %${Math.round(chance * 100)} idi.`;
        state.gameOver = { type: 'darbe', title: 'Darbe: cunta yönetime el koydu', text: 'Halk desteğin kalmamıştı, ordu da senden yana değildi. Cunta sabaha karşı radyodan bildiriyi okudu; seni Meclis çıkışında tutukladılar, göstermelik mahkeme ömür boyu hapis verdi. Ekonomi yönetimi generallere geçti.' };
        state.score -= 400;
      }
    } else if (choice === 'bargain') {
      success = true; title = 'Generallerle uzlaşma';
      text = 'Darbeciler kışlaya döndü; karşılığında savunma bütçesi artırıldı, güvenlik kurulunda ordunun sözü ağırlaştı. Piyasa "askerî vesayet" diyor.';
      state.policy.defense = Math.min(8, state.policy.defense + 2); state.cred -= 7; state.support = clamp(state.support - 5, 0, 100); state.flags.vesayet = true;
      state.flags.coupCooldown = state.turn + 24; SEG(state, -3); shock(state, { cds: 30, months: 3 });
    } else if (choice === 'intl') {
      const chance = clamp(0.2 + (state.cred - 40) / 80, 0.1, 0.9);
      success = rng() < chance;
      if (success) {
        title = 'Dünya darbeyi tanımadı';
        text = `Müttefikler yaptırım tehdidiyle darbecileri yalnız bıraktı; girişim çöktü. Başarı şansı %${Math.round(chance * 100)} idi.`;
        state.cred += 3; state.support = clamp(state.support + 4, 0, 100); state.flags.coupCooldown = state.turn + 15; state.score += 120;
      } else {
        title = 'Kimse telefonu açmadı';
        text = `Güvenilirliğiniz düşüktü; dış dünya "iç mesele" dedi. Başarı şansı %${Math.round(chance * 100)} idi.`;
        state.gameOver = { type: 'darbe', title: 'Darbe: cunta yönetime el koydu', text: 'Dış destek gelmedi, ordu yönetime el koydu. Seni sınır dışı edip mal varlığına el koydular; ülke yıllarca sürecek bir askerî yönetime girdi.' };
        state.score -= 400;
      }
    }
    state.flags.coupResult = { success, title, text, choice };
    return state.flags.coupResult;
  }

  global.Coup = { risk, shouldAttempt, resolve };
  if (typeof module !== 'undefined') module.exports = global.Coup;
})(typeof window !== 'undefined' ? window : globalThis);
