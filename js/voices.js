/* ===========================================================
   ÜLKEYİ YÖNET — Halkın sesi ve danışman yorumları
   =========================================================== */
(function (global) {
  'use strict';

  const QUOTES = {
    isci: {
      bad: ['Maaş bitiyor, ay bitmiyor Başkanım!', 'Fabrikada işten çıkarmalar başladı, sırada ben varım.', 'Kirayı ödeyince elimde hiçbir şey kalmıyor.', 'Pazardan üç domates alıp dönüyoruz artık.'],
      mid: ['İdare ediyoruz, ama zam bekliyoruz.', 'Mesai varsa geçiniyoruz, yoksa zor.', 'Enflasyon düşüyor diyorlar ama markette görmüyoruz.'],
      good: ['Bu ay zam aldım, keyfim yerinde!', 'Fabrika tam kapasite, mesai bol.', 'Çocuklara bayramlık aldık, şükür.'],
    },
    emekli: {
      bad: ['Emekli maaşıyla ilaç bile alamıyorum.', 'Torunlara harçlık veremez olduk.', 'Bu enflasyonla açlık sınırının altındayız.'],
      mid: ['İkramiye gelse biraz nefes alırız.', 'Faturalar geliyor, maaş zor yetiyor.', 'Genç yaşlı hepimiz sabrediyoruz.'],
      good: ['Bu dönem emekliye değer verildi.', 'Torunlarla tatile gidebildik.', 'Maaşım artık markette bir şey ediyor.'],
    },
    esnaf: {
      bad: ['Bu faizle kredi alıp mal alamıyorum!', 'Kepenk kapatan komşularım var, sırada biziz.', 'Vergi yükü belimizi büktü.', 'Müşteri yok, herkes bakıp geçiyor.'],
      mid: ['Ne kâr ne zarar, dükkân dönüyor.', 'Kur biraz dursa plan yapabiliriz.', 'Kredi faizleri düşerse yatırım yaparız.'],
      good: ['Siparişler artıyor, iki çırak daha aldım!', 'Faizler indi, dükkânı büyütüyoruz.', 'Bu sene ihracat rekor kırdı.'],
    },
    ciftci: {
      bad: ['Mazot ve gübre fiyatı tarlayı ekemez etti.', 'Ürünüm hale gitti, elime bir şey geçmedi.', 'Kur fırlayınca tohum bile alamadık.'],
      mid: ['Hasat fena değil, fiyat da fena değil.', 'Destekler gelse rahatlarız.', 'Havalar bizden yana giderse şükür.'],
      good: ['Bu sene bereket var, traktör aldım!', 'Destek primi tam zamanında geldi.', 'Köyde herkesin yüzü gülüyor.'],
    },
    memur: {
      bad: ['Maaşımız enflasyonun altında kaldı.', 'Tasarruf dediler, servisleri kaldırdılar.', 'Ay sonunu kredi kartıyla getiriyorum.'],
      mid: ['Maaş zammı beklentimiz var.', 'Kamu hizmetleri iyi kötü yürüyor.', 'Kira bizi de zorluyor.'],
      good: ['Bu dönem kamuya değer verildi.', 'Maaşımız enflasyonun üzerinde arttı.', 'Yeni hastane açıldı, gurur duyuyoruz.'],
    },
    genc: {
      bad: ['Mezun oldum, bir yıldır iş yok!', 'Yurt dışına gitmek istiyorum, burada gelecek yok.', 'Ev kiralamak hayal, evlenmek daha da hayal.'],
      mid: ['Stajdan sonra kadro olur mu bilmiyorum.', 'İş var ama maaşlar düşük.', 'Umut var mı yok mu, bekliyoruz.'],
      good: ['Teknoloji vadisinde işe girdim!', 'Sosyal konuta başvurdum, sıra bize geldi.', 'Arkadaşlarım da iş buldu, kalıyoruz burada.'],
    },
  };

  function pickQuote(segId, mood, rng) {
    const set = QUOTES[segId] || QUOTES.isci;
    const bucket = mood < 42 ? set.bad : (mood < 62 ? set.mid : set.good);
    return bucket[Math.floor((rng ? rng() : Math.random()) * bucket.length)];
  }

  const SIGNS = [
    { cond: s => s.infl > 25, text: 'GEÇİNEMİYORUZ' },
    { cond: s => s.unemp > 10.5, text: 'İŞ İSTİYORUZ' },
    { cond: s => s.moods.emekli < 40, text: 'EMEKLİ AÇ' },
    { cond: s => s.policy.directTax > 21 || s.policy.indirectTax > 20, text: 'VERGİYE HAYIR' },
    { cond: s => s.policy.rate > 35, text: 'FAİZ BİTİRDİ' },
    { cond: s => true, text: 'ZAM İSTİYORUZ' },
  ];
  function pickSigns(state) {
    return SIGNS.filter(x => x.cond(state)).map(x => x.text).slice(0, 3);
  }

  // Danışman yorumları (çeyrek raporu)
  function advisorComment(state, report) {
    const s = state, d = report ? report.delta : {};
    const lines = [];
    if (s.realRate < 0) lines.push('Reel faiz negatif: TL tutmak cazip değil, kur baskısı artacaktır. Faizi beklentilerin üzerine çıkarmayı düşünün.');
    else if (s.realRate > 12) lines.push('Reel faiz çok yüksek: dezenflasyon hızlanır ama büyüme ve istihdam bedel ödüyor. Kademeli indirim için zemin oluşuyor.');
    if (s.infl > s.exp + 4) lines.push('Enflasyon beklentilerin üzerinde seyrediyor; güvenilir bir sıkı duruş beklentileri çıpalayabilir.');
    if (d.infl !== undefined && d.infl < -0.6) lines.push('Fiyat artışları belirgin yavaşladı. Bu ivmeyi korumak için erken gevşemeden kaçının.');
    if (d.infl !== undefined && d.infl > 0.8) lines.push('Enflasyon yeniden ivmelendi. Kur geçişkenliği ve talep baskısına dikkat.');
    if (s.coverMonths < 3.5) lines.push('Rezervler ithalatın 3,5 ayını bile karşılamıyor. Döviz satarak kuru savunmak sürdürülebilir değil.');
    if (s.deficit > 6) lines.push('Bütçe açığı %6\'yı aştı: piyasa mali disiplin sorguluyor. Harcamaları kısmadan bu açık kapanmaz.');
    if (s.unemp > 11) lines.push('İşsizlik kritik seviyede; gençlerin sabrı tükeniyor. İstihdam programları ve yatırım gündeme alınmalı.');
    if (s.support < 35) lines.push('Kamuoyu desteği tehlikeli ölçüde düşük. Sokakta huzursuzluk artıyor; hızlı bir halk paketi gerekebilir.');
    if (s.cred > 70) lines.push('Politika güvenilirliği güçlü. Bu sermayeyi kademeli normalleşme için kullanabilirsiniz.');
    if (s.cds > 500) lines.push('CDS primi kriz bölgesinde. Yabancı yatırımcı çıkışı hızlanmadan güven verici bir adım gerekli.');
    if (!lines.length) lines.push('Tablo dengeli. Verileri izlemeye devam edelim; sürpriz şoklara karşı rezerv ve güvenilirlik tamponunu koruyun.');
    return lines.slice(0, 3);
  }

  const TUTORIAL = [
    { text: 'Hoş geldiniz Başkanım! Ben başekonomistiniz Nilüfer. Görevimiz dört yıl boyunca bu ülkenin ekonomisini yönetmek: enflasyonu hedefe indirmek, işsizliği düşürmek ve halkı yanımızda tutmak.' },
    { text: 'Yukarıdaki şehir gerçek zamanlı: vatandaşların yüzü ekonomiye göre değişir, fabrika bacası büyümeyle tüter, market etiketleri enflasyonla yükselir. Bir vatandaşa tıklarsanız derdini anlatır; binalara tıklarsanız ilgili politikalar açılır.' },
    { text: 'Sol panelde göstergeler, ortada politika araçları (para, maliye, programlar), sağda halk kesimleri var. Kararlarınızı verip "Ayı İlerlet" deyin ya da Enter tuşuna basın. Her çeyrek sonu size rapor sunacağım. Bol şans!' },
  ];

  global.Voices = { QUOTES, pickQuote, pickSigns, advisorComment, TUTORIAL };
})(typeof window !== 'undefined' ? window : globalThis);
