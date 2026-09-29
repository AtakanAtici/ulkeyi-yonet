/* ===========================================================
   ÜLKEYİ YÖNET — Olaylar (şoklar ve karar kartları)
   Her olay: id, icon, title, text, weight, cond(s), once, choices[]
   choice.apply(s) durumu doğrudan değiştirir; s.shocks'a süreli etkiler eklenir.
   =========================================================== */
(function (global) {
  'use strict';
  const shock = (s, o) => s.shocks.push(Object.assign({ months: 3 }, o));
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));

  const EVENTS = [
    {
      id: 'fed', icon: '🇺🇸', title: 'Fed Faizi Artırdı', weight: 3,
      text: 'ABD Merkez Bankası sürpriz bir şekilde faizi 75 baz puan artırdı. Gelişen piyasalardan sermaye çıkışı başladı; dolar küresel olarak güçleniyor.',
      cond: s => s.globalRate < 7,
      choices: [
        { label: 'Faizi 200 baz puan artır', desc: 'Sermaye çıkışını frenle. Büyüme ve esnaf üzülür.', apply: s => { s.policy.rate = cl(s.policy.rate + 2, 0, 80); s.globalRate += 0.75; shock(s, { cds: 15, months: 2 }); } },
        { label: 'İzle ve bekle', desc: 'Kur bir miktar yükselir, rezervlerden akış olur.', apply: s => { s.globalRate += 0.75; shock(s, { fx: 0.9, cds: 30, reserves: -3, months: 3 }); } },
      ],
    },
    {
      id: 'petrol', icon: '🛢️', title: 'Petrol Fiyatı Fırladı', weight: 3,
      text: 'Orta Doğu\'daki gerilim nedeniyle Brent petrol %30 yükseldi. Akaryakıt, nakliye ve doğalgaz faturaları zamlanacak; cari açık genişleyecek.',
      choices: [
        { label: 'Akaryakıtta ÖTV indirimi', desc: 'Pompaya yansımayı azalt. Bütçeye 0,6 puan yük.', apply: s => { shock(s, { infl: 0.15, months: 5 }); s.policy.spendCurrent += 0.6; s.ca -= 0.6; s.flags.ciftciBonus = (s.flags.ciftciBonus || 0) + 4; } },
        { label: 'Fiyatlara yansıt', desc: 'Bütçe korunur, enflasyon ve halk tepkisi artar.', apply: s => { shock(s, { infl: 0.4, months: 5 }); s.ca -= 0.8; s.anger += 6; } },
      ],
    },
    {
      id: 'kuraklik', icon: '☀️', title: 'Kuraklık Vurdu', weight: 2,
      text: 'Yağışlar mevsim normallerinin çok altında kaldı. Buğday, ayçiçeği ve sebze rekoltesi düştü; gıda fiyatları tırmanıyor, çiftçi borç batağında.',
      cond: s => s.month >= 5 && s.month <= 9,
      choices: [
        { label: 'Çiftçiye afet destek paketi', desc: 'Transferler +0,5 puan, çiftçi rahatlar.', apply: s => { s.policy.transfers += 0.5; s.flags.ciftciBonus = 12; shock(s, { infl: 0.25, months: 4 }); } },
        { label: 'Gıda ithalatını serbest bırak', desc: 'Fiyatlar frenlenir; çiftçi öfkelenir, cari açık büyür.', apply: s => { shock(s, { infl: 0.1, months: 4 }); s.moods.ciftci -= 12; s.ca -= 0.5; } },
        { label: 'Hiçbir şey yapma', desc: 'Piyasa çözer diyorsunuz.', apply: s => { shock(s, { infl: 0.35, months: 4 }); s.moods.ciftci -= 6; } },
      ],
    },
    {
      id: 'deprem', icon: '🏚️', title: 'Büyük Deprem', weight: 1.2, once: true,
      text: 'Sanayi bölgesinde 6,8 büyüklüğünde deprem. Binlerce bina hasarlı, fabrikalar durdu. Halk kenetlendi ama yeniden inşa için devasa kaynak gerekiyor.',
      choices: [
        { label: 'Deprem vergisi çıkar', desc: 'Dolaylı vergi +1,5 puan. Bütçe korunur, halk homurdanır.', apply: s => { s.policy.indirectTax += 1.5; s.policy.invest += 1.5; shock(s, { growth: -1.2, months: 3 }); s.support += 2; } },
        { label: 'Borçlanarak finanse et', desc: 'Borç/GSYH +3 puan, CDS yükselir.', apply: s => { s.debt += 3; s.policy.invest += 1.5; shock(s, { growth: -1.2, cds: 25, months: 3 }); s.support += 3; } },
        { label: 'Uluslararası yardım iste', desc: 'Rezervler +6 milyar $, güvenilirlik hafif düşer.', apply: s => { s.reserves += 6; s.cred -= 2; s.policy.invest += 1; shock(s, { growth: -1.5, months: 3 }); s.support += 1; } },
      ],
    },
    {
      id: 'turizm', icon: '🏖️', title: 'Turizmde Rekor Sezon', weight: 2,
      text: 'Kıyı otelleri doldu taştı: turist sayısı tüm zamanların rekorunu kırdı. Döviz girişi güçleniyor, hizmet sektöründe istihdam artıyor.',
      cond: s => s.month >= 6 && s.month <= 9,
      choices: [{ label: 'Harika!', desc: 'Rezervler ve büyüme destekleniyor.', apply: s => { shock(s, { reserves: 3.5, growth: 0.4, months: 3 }); s.moods.esnaf += 4; } }],
    },
    {
      id: 'riskon', icon: '📈', title: 'Küresel Risk İştahı Arttı', weight: 2,
      text: 'Gelişmiş ülkelerde faiz indirimi beklentisiyle yatırımcılar gelişen piyasalara yöneldi. Tahvil piyasasına sıcak para giriyor.',
      choices: [{ label: 'Fırsatı değerlendir', desc: 'CDS düşer, TL değerlenir, rezerv birikir.', apply: s => { shock(s, { cds: -40, fx: -0.9, reserves: 2.5, months: 4 }); } }],
    },
    {
      id: 'resesyon', icon: '🌧️', title: 'Küresel Resesyon', weight: 1.5,
      text: 'Avrupa ekonomileri daralmaya başladı. İhracat siparişleri iptal ediliyor; ancak petrol ucuzladı ve küresel faizler geriliyor.',
      choices: [
        { label: 'Kamu yatırımıyla destekle', desc: 'Yatırım harcaması +1 puan.', apply: s => { s.policy.invest += 1; shock(s, { growth: -0.6, months: 6 }); s.globalRate -= 0.5; } },
        { label: 'Bütçeyi koru', desc: 'Daralma daha sert hissedilir.', apply: s => { shock(s, { growth: -1.0, months: 6 }); s.globalRate -= 0.5; s.ca += 0.5; } },
      ],
    },
    {
      id: 'notartis', icon: '⭐', title: 'Kredi Notu Yükseldi', weight: 2,
      text: 'Uluslararası derecelendirme kuruluşu, disiplinli politikaları gerekçe göstererek ülkenin kredi notunu bir kademe artırdı.',
      cond: s => s.cred >= 58 && s.infl < s.history[Math.max(0, s.history.length - 7)].infl,
      choices: [{ label: 'Teşekkürler', desc: 'CDS düşer, güvenilirlik artar.', apply: s => { shock(s, { cds: -50, months: 4 }); s.cred += 4; s.support += 2; } }],
    },
    {
      id: 'notindirim', icon: '📉', title: 'Kredi Notu Düşürüldü', weight: 2,
      text: 'Derecelendirme kuruluşu, "politika belirsizliği ve rezerv zayıflığı" gerekçesiyle notu kırdı. Yabancı fonlar tahvil satıyor.',
      cond: s => s.cred < 42 || s.coverMonths < 3.5,
      choices: [{ label: 'Kabul et', desc: 'CDS yükselir, kur baskısı artar.', apply: s => { shock(s, { cds: 60, fx: 1.0, reserves: -2, months: 3 }); s.cred -= 2; } }],
    },
    {
      id: 'banka', icon: '🏦', title: 'Bir Banka Zor Durumda', weight: 1.5,
      text: 'Orta ölçekli bir banka, batık kredilerle sarsıldı ve likidite sıkıntısına düştü. Mudiler şubelerin önünde kuyruk oluşturdu.',
      cond: s => s.policy.rate > 25 || s.growth < 1 || s.policy.creditStd > 0,
      choices: [
        { label: 'Merkez Bankası likidite versin', desc: 'Panik biter; parasal genişleme beklentileri bozar.', apply: s => { s.exp += 0.6; s.cred -= 2; s.moods.esnaf += 3; } },
        { label: 'Bankayı batmaya bırak', desc: 'Ahlaki tehlike yok ama kredi kanalı tıkanır.', apply: s => { shock(s, { growth: -0.9, months: 4 }); s.moods.esnaf -= 10; s.moods.isci -= 4; s.cred += 1; } },
      ],
    },
    {
      id: 'grev', icon: '✊', title: 'Genel Grev Dalgası', weight: 2,
      text: 'Sendikalar enflasyona karşı maaş artışı talebiyle genel greve gitti. Fabrikalar, limanlar ve belediye hizmetleri durdu.',
      cond: s => s.moods.isci < 42,
      choices: [
        { label: 'Kamu maaşlarına ek zam', desc: 'Cari harcama +1 puan; işçi ve memur rahatlar, enflasyon hafif artar.', apply: s => { s.policy.spendCurrent += 1; s.moods.isci += 10; s.moods.memur += 8; shock(s, { infl: 0.2, months: 3 }); } },
        { label: 'Taviz verme', desc: 'Üretim kaybı; öfke büyür.', apply: s => { shock(s, { growth: -0.7, months: 2 }); s.anger += 8; s.moods.isci -= 6; s.cred += 1; } },
      ],
    },
    {
      id: 'emekli', icon: '👴', title: 'Emekliler Meclis Önünde', weight: 2,
      text: 'On binlerce emekli "Açlık sınırının altındayız" pankartlarıyla Meclis önünde toplandı. Bayram ikramiyesinin iki katına çıkarılmasını istiyorlar.',
      cond: s => s.moods.emekli < 45,
      choices: [
        { label: 'İkramiyeyi artır', desc: 'Transferler +0,8 puan. Emekliler mutlu, bütçe açığı büyür.', apply: s => { s.policy.transfers += 0.8; s.moods.emekli += 14; } },
        { label: 'Bütçe el vermiyor', desc: 'Emekli tepkisi büyür.', apply: s => { s.moods.emekli -= 8; s.anger += 4; } },
      ],
    },
    {
      id: 'skandal', icon: '📰', title: 'İhale Skandalı', weight: 1.5,
      text: 'Bir gazete, kamu ihalelerinde usulsüzlük iddialarını belgeleriyle yayımladı. Muhalefet istifa çağrısı yapıyor, piyasa tedirgin.',
      choices: [
        { label: 'Bağımsız soruşturma başlat', desc: 'Kısa vadede sarsıntı, sonra güven artar.', apply: s => { s.support -= 3; s.cred += 2; SEG(s, -3); s.flags.investigation = true; } },
        { label: 'İddiaları reddet', desc: 'Güvenilirlik ve halk desteği düşer.', apply: s => { s.cred -= 5; SEG(s, -5); s.anger += 6; } },
      ],
    },
    {
      id: 'vergiaffi', icon: '📋', title: 'Vergi Affı Teklifi', weight: 1.5,
      text: 'İş dünyası, birikmiş vergi borçları için yapılandırma ve af istiyor. Kısa vadede Hazine\'ye nakit girer ama dürüst mükellef küser.',
      choices: [
        { label: 'Affı çıkar', desc: 'Borç −1,5 puan, esnaf mutlu, güvenilirlik −3.', apply: s => { s.debt -= 1.5; s.moods.esnaf += 8; s.cred -= 3; } },
        { label: 'Reddet', desc: 'Mali disiplin sinyali.', apply: s => { s.cred += 1.5; s.moods.esnaf -= 4; } },
      ],
    },
    {
      id: 'yatirim', icon: '🏭', title: 'Dev Yabancı Yatırım Teklifi', weight: 2,
      text: 'Küresel bir otomotiv şirketi ülkede batarya fabrikası kurmak istiyor: 8 milyar $ yatırım, 15 bin istihdam. Karşılığında vergi muafiyeti ve arsa talep ediyorlar.',
      cond: s => s.cred >= 50,
      choices: [
        { label: 'Teşvik paketi ver', desc: 'Doğrudan vergi −0,5 puan; büyüme ve rezerv artar.', apply: s => { s.policy.directTax -= 0.5; shock(s, { growth: 0.5, reserves: 2.5, months: 6 }); s.moods.genc += 6; s.moods.isci += 4; } },
        { label: 'Teşviksiz gel', desc: 'Şirket yatırımı yarıya indirir.', apply: s => { shock(s, { growth: 0.2, reserves: 1, months: 6 }); s.moods.genc += 2; } },
      ],
    },
    {
      id: 'aniduruş', icon: '🌪️', title: 'Sermaye Kaçışı Başladı', weight: 3,
      text: 'Yabancı fonlar toplu satışa geçti. Kur bir günde %6 sıçradı, bankalar döviz bulamıyor. Piyasa sizden acil bir sinyal bekliyor.',
      cond: s => s.cds > 380 || s.coverMonths < 3.5 || s.realRate < -4,
      choices: [
        { label: 'Faizi 500 baz puan artır', desc: 'Klasik reçete: acı ama etkili.', apply: s => { s.policy.rate = cl(s.policy.rate + 5, 0, 80); shock(s, { fx: 1.2, cds: 20, months: 2 }); s.cred += 3; } },
        { label: 'Sermaye kontrolü uygula', desc: 'Kaçış durur ama güven 8 puan düşer, esnaf öfkelenir.', apply: s => { s.cred -= 8; s.moods.esnaf -= 10; shock(s, { fx: -0.5, cds: 60, months: 3 }); } },
        { label: 'Rezervle savun', desc: 'Bu ay 15 milyar $ satılır.', apply: s => { s.reserves -= 15; shock(s, { fx: 0.6, cds: 35, months: 3 }); s.cred -= 2; } },
      ],
    },
    {
      id: 'imf', icon: '🏛️', title: 'IMF Kapıyı Çaldı', weight: 14, once: true,
      text: 'Rezervler kritik seviyede. IMF heyeti, 30 milyar $ stand-by anlaşması öneriyor: karşılığında kemer sıkma, harcama kesintisi ve şeffaflık taahhüdü.',
      cond: s => s.coverMonths < 2.5,
      choices: [
        { label: 'Anlaşmayı imzala', desc: 'Rezerv +30, güven +8; harcama ve transferler kesilir, halk küser.', apply: s => { s.reserves += 30; s.cred += 8; s.policy.spendCurrent -= 2; s.policy.transfers -= 1; SEG(s, -8); shock(s, { cds: -80, months: 4 }); } },
        { label: 'Bağımsızlığımızı koruruz', desc: 'Kur baskısı sürer.', apply: s => { shock(s, { fx: 1.5, cds: 40, months: 3 }); s.support += 2; } },
      ],
    },
    {
      id: 'salgin', icon: '🦠', title: 'Salgın Alarmı', weight: 1, once: true,
      text: 'Yeni bir virüs hızla yayılıyor. Hastaneler doluyor, hizmet sektörü durma noktasında. Halk sağlığı ile ekonomi arasında zor bir seçim.',
      choices: [
        { label: 'Kısıtlama ve destek paketi', desc: 'Büyüme sert düşer; transferler +1,5, halk kenetlenir.', apply: s => { shock(s, { growth: -2.5, months: 4 }); s.policy.transfers += 1.5; s.support += 3; } },
        { label: 'Ekonomiyi açık tut', desc: 'Büyüme daha az düşer ama halk tepkisi ve belirsizlik artar.', apply: s => { shock(s, { growth: -1.2, months: 4 }); s.anger += 10; SEG(s, -5); } },
      ],
    },
    {
      id: 'gaz', icon: '⛽', title: 'Karadeniz\'de Gaz Keşfi', weight: 1, once: true,
      text: 'Karadeniz\'de büyük bir doğalgaz rezervi bulundu. Üretim başladığında ithalat faturası düşecek, cari açık daralacak. Halk coşkulu.',
      choices: [{ label: 'Müjdeyi ver', desc: 'Cari açık +0,7 iyileşir, rezerv girişi 12 ay sürer.', apply: s => { s.ca += 0.7; shock(s, { reserves: 1.5, months: 12 }); s.support += 4; } }],
    },
    {
      id: 'savas', icon: '⚔️', title: 'Komşuda Savaş', weight: 1.2,
      text: 'Sınır komşusunda çatışma patlak verdi. Enerji fiyatları yükseldi, ticaret yolları kapandı, mülteci akını başladı. Yatırımcılar bölgeden kaçıyor.',
      choices: [
        { label: 'İnsani yardım ve sınır güvenliği', desc: 'Cari harcama +0,7. Halk desteği korunur.', apply: s => { s.policy.spendCurrent += 0.7; shock(s, { fx: 1.2, cds: 70, infl: 0.2, months: 3 }); } },
        { label: 'Sınırları kapat', desc: 'Bütçe korunur, ticaret kaybı büyüme düşürür.', apply: s => { shock(s, { fx: 1.0, cds: 60, infl: 0.25, growth: -0.5, months: 3 }); } },
      ],
    },
    {
      id: 'ekmek', icon: '🥖', title: 'Ekmek Zammı Viral Oldu', weight: 2,
      text: 'Bir fırıncının "Ekmek artık lüks" videosu milyonlarca kez izlendi. Sosyal medyada hükümete tepki büyüyor, muhalefet sokak çağrısı yapıyor.',
      cond: s => s.infl > 20,
      choices: [
        { label: 'Ekmeğe tavan fiyat', desc: 'Kısa vadede rahatlama; fırıncılar ve esnaf isyan eder.', apply: s => { shock(s, { infl: -0.1, months: 3 }); s.moods.esnaf -= 8; s.moods.isci += 4; s.moods.emekli += 4; s.cred -= 2; } },
        { label: 'Piyasaya bırak', desc: 'Halk tepkisi artar.', apply: s => { s.anger += 7; s.exp += 0.3; } },
      ],
    },
    {
      id: 'hasat', icon: '🌾', title: 'Bereketli Hasat', weight: 2,
      text: 'Yağışlar tam zamanında geldi: tahıl ve meyve rekoltesi rekor kırdı. Hal fiyatları geriliyor, çiftçi yüzü gülüyor.',
      cond: s => s.month >= 6 && s.month <= 10,
      choices: [{ label: 'Bereket olsun', desc: 'Gıda enflasyonu 3 ay düşer.', apply: s => { shock(s, { infl: -0.25, months: 3 }); s.moods.ciftci += 8; } }],
    },
    {
      id: 'teknoloji', icon: '💡', title: 'Teknoloji Vadisi Açıldı', weight: 1.2,
      text: 'Üniversite-sanayi işbirliğiyle kurulan teknoloji vadisi ilk şirketlerini ağırlıyor. Yazılım ihracatı artıyor, gençler burada çalışmak istiyor.',
      cond: s => s.policy.invest >= 6,
      choices: [{ label: 'Destekle', desc: 'Potansiyel büyüme ve teknoloji seviyesi kalıcı olarak artar.', apply: s => { s.potential += 0.25; s.tech = Math.min(100, s.tech + 10); s.moods.genc += 7; } }],
    },
    {
      id: 'secimvaadi', icon: '🗳️', title: 'Seçim Yaklaşıyor', weight: 2.5,
      text: 'Anketler başa baş. Parti kurmayları seçim öncesi "cömert bir paket" istiyor: emekliye ikramiye, asgari ücrete ara zam, öğrenciye burs.',
      cond: s => s.turn >= 30 && s.turn <= 44,
      choices: [
        { label: 'Seçim paketini açıkla', desc: 'Transferler +1,5 puan; halk sevinir, piyasa endişelenir.', apply: s => { s.policy.transfers += 1.5; SEG(s, 6); s.cred -= 4; shock(s, { infl: 0.2, cds: 30, months: 3 }); } },
        { label: 'Disiplini koru', desc: 'Piyasa alkışlar, parti homurdanır.', apply: s => { s.cred += 3; SEG(s, -2); } },
      ],
    },
    {
      id: 'ihracat', icon: '🚢', title: 'İhracatçılar Kurdan Şikâyetçi', weight: 1.5,
      text: 'İhracatçı birlikleri, TL\'nin "aşırı değerli" olduğunu ve rekabet gücünün kaybolduğunu söylüyor. Kur ayarlaması istiyorlar.',
      cond: s => s.depMonthly < 0.5 && s.ca < -2,
      choices: [
        { label: 'Döviz al, kuru gevşet', desc: 'Rezerv artar, kur %2 yükselir, enflasyon hafif artar.', apply: s => { s.reserves += 5; shock(s, { fx: 1.0, months: 2 }); s.moods.esnaf += 5; } },
        { label: 'Kur piyasada oluşur', desc: 'Sanayici küser.', apply: s => { s.moods.esnaf -= 4; s.cred += 1; } },
      ],
    },
    {
      id: 'parareformu', icon: '💱', title: 'Para Reformu Masada', weight: 8, once: true,
      text: 'Danışmanlar radikal bir istikrar programı öneriyor: paradan sıfır atılacak, bütçe disiplini anayasaya yazılacak, Merkez Bankası bağımsızlığı güvence altına alınacak. Güven şoku yaratabilir ya da boş bir gösteri olarak kalabilir.',
      cond: s => s.infl > 55,
      choices: [
        { label: 'Reformu ilan et ve sıkı programa bağlan', desc: 'Beklentiler kırılır, güven +12; transferler kısılır, halk kısa vadede küser.', apply: s => { s.exp -= 0.2 * s.exp; s.cred += 12; s.policy.transfers = Math.max(3, s.policy.transfers - 1.5); s.policy.spendCurrent = Math.max(14, s.policy.spendCurrent - 1); SEG(s, -5); shock(s, { cds: -120, months: 6 }); } },
        { label: 'Sadece sıfır at, gerisi sonra', desc: 'Kozmetik değişiklik: küçük etki.', apply: s => { s.exp -= 0.05 * s.exp; s.cred += 2; } },
        { label: 'Şimdi değil', desc: 'Mevcut yolda devam.', apply: s => { s.cred -= 1; } },
      ],
    },
    {
      id: 'gerilim', icon: '🪖', title: 'Sınırda Gerilim Tırmanıyor', weight: 3, once: true,
      text: 'Komşu ülke sınıra birlik yığıyor, devlet televizyonunda tehditkâr açıklamalar yapılıyor. İstihbarat: "Aylar içinde saldırı olasılığı yüksek." Savunma gücünüz ve teknolojiniz ne durumda?',
      cond: s => s.turn >= 6 && !s.war && !s.flags.warDone,
      choices: [
        { label: 'Savunmaya acil kaynak ayır', desc: 'Savunma harcaması +2 puan, AR-GE +0,5 puan. Bütçe zorlanır ama ordu güçlenir.', apply: s => { s.flags.tension = true; s.policy.defense = Math.min(8, s.policy.defense + 2); s.policy.rnd = Math.min(4, s.policy.rnd + 0.5); s.defense = Math.min(100, s.defense + 6); } },
        { label: 'Diplomasi girişimi başlat', desc: 'Güvenilirlik +2; savaş yine de gelebilir.', apply: s => { s.flags.tension = true; s.flags.diplomacy = true; s.cred += 2; } },
        { label: 'Görmezden gel', desc: 'Piyasa sakin kalır; hazırlıksız yakalanma riski.', apply: s => { s.flags.tension = true; s.moods.esnaf += 2; } },
      ],
    },
    {
      id: 'savasilani', icon: '💣', title: 'DÜŞMAN ÜLKE SAVAŞ AÇTI!', weight: 0, once: true, manual: true,
      text: 'Şafakta sınır karakolları vuruldu, ilk füzeler başkente düştü. Sirenler çalıyor, halk sokakta. Genelkurmay acil karar bekliyor: direnecek miyiz, seferberlik ilan edecek miyiz, yoksa masaya mı oturacağız?',
      choices: [
        { label: 'Direneceğiz!', desc: 'Savaş başlar. Savunma gücü ve teknolojiniz cephede belirleyici olur.', apply: (s, rng) => { War.declare(s, rng || Model.makeRng(s.seed + s.turn), {}); } },
        { label: 'Seferberlik ilan et ve diren', desc: 'Hemen tam seferberlik: güç +18, ekonomi savaş düzenine geçer.', apply: (s, rng) => { War.declare(s, rng || Model.makeRng(s.seed + s.turn), { mobilize: true }); } },
        { label: 'Toprak ver, barış iste', desc: 'Savaş olmaz ama halk aşağılanmayı affetmez: destek −18, güvenilirlik −8, borç +5.', apply: s => { s.flags.warDone = true; s.flags.tension = false; s.flags.appeased = true; SEG(s, -18); s.cred -= 8; s.debt += 5; s.anger = Math.min(100, s.anger + 15); } },
      ],
    },
    {
      id: 'darbe', icon: '🪖', title: 'DARBE GİRİŞİMİ!', weight: 0, once: false, manual: true,
      text: 'Gece yarısı tanklar köprüleri tuttu, devlet radyosundan "yönetime el konulmuştur" bildirisi okunuyor. Genelkurmayın bir kanadı sizinle, bir kanadı darbecilerle. Sokağa çıkma yasağı ilan edildi. Karar sizin, saatler sayılı.',
      choices: [
        { label: 'Halkı sokağa çağır: direniş!', desc: 'Kamuoyu desteği yüksekse darbe çöker; düşükse direniş kırılır ve cunta seni tutuklar.', apply: (s, rng) => { Coup.resolve(s, 'resist', rng); } },
        { label: 'Generallerle pazarlık yap', desc: 'Darbe kesin biter ama savunma bütçesi artar, güvenilirlik −7, ordu siyasette söz sahibi olur.', apply: (s, rng) => { Coup.resolve(s, 'bargain', rng); } },
        { label: 'Uluslararası destek iste', desc: 'Güvenilirlik yüksekse dünya darbeyi tanımaz; düşükse kimse telefonu açmaz ve cunta kazanır.', apply: (s, rng) => { Coup.resolve(s, 'intl', rng); } },
      ],
    },
  ];

  function SEG(s, d) { Object.keys(s.moods).forEach(k => s.moods[k] = cl(s.moods[k] + d, 0, 100)); }

  function pickEvent(state, rng) {
    const diff = Model.DIFFICULTIES[state.difficulty];
    if (rng() > diff.shockProb) return null;
    const recent = state.events.slice(-6).map(e => e.id);
    const pool = EVENTS.filter(e => {
      if (e.manual || e.weight <= 0) return false;
      if (recent.includes(e.id)) return false;
      if (e.once && state.events.some(x => x.id === e.id)) return false;
      try { return !e.cond || e.cond(state); } catch (err) { return false; }
    });
    if (!pool.length) return null;
    const total = pool.reduce((a, e) => a + e.weight, 0);
    let r = rng() * total;
    for (const e of pool) { r -= e.weight; if (r <= 0) return e; }
    return pool[pool.length - 1];
  }

  global.Events = { EVENTS, pickEvent };
  if (typeof module !== 'undefined') module.exports = global.Events;
})(typeof window !== 'undefined' ? window : globalThis);
