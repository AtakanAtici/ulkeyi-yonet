# Ülkeyi Yönet — Ekonomi Simülasyonu

Bir ülkenin ekonomisini 48 ay boyunca yönettiğiniz, tarayıcıda çalışan bir strateji oyunu.
Kurulum gerektirmez: `index.html` dosyasını çift tıklayarak açmanız yeterli.

## Nasıl oynanır
- **Şehir sahnesi**: Vatandaşların yüzü ekonomiye göre değişir, işsizler bankta oturur, öfke artınca Meclis önünde protesto başlar. Fabrika bacası büyümeyle tüter, market etiketi enflasyonla yükselir, şantiye yatırım harcamasıyla canlanır.
  - Bir vatandaşa tıklayın: derdini anlatır.
  - Bir binaya tıklayın: ilgili politika sekmesi açılır.
- **Para politikası**: politika faizi, zorunlu karşılıklar, kredi standartları, iletişim duruşu, ileri yönlendirme, döviz müdahalesi.
- **Maliye**: doğrudan/dolaylı vergi, cari/yatırım/transfer harcamaları, bütçe özeti.
- **Programlar**: doğalgaz sübvansiyonu, gıdada KDV indirimi, sosyal konut, genç istihdam, tarım desteği, kamuda tasarruf.
- **Asgari ücret**: Ocak ve Temmuz aylarında karar sorulur.
- **Savaş**: Maliye sekmesindeki savunma ve AR-GE harcamaları zamanla "Savunma gücü" ve "Teknoloji" seviyesini oluşturur. Sınır gerilimi uyarısından sonra düşman ülke savaş açabilir: uçaklar şehre bomba bırakır (hava savunması güçlüyse bombalar havada önlenir), halk kaçışır, binalar hasar alır. Savaş Kabinesi sekmesinde seferberlik, savaş tahvili, müttefik yardımı, sıkıyönetim, sivil savunma ve ateşkes kararları verilir. Cephe güç oranına göre ilerler; iyi hazırlanmış ülke kazanır, hazırlıksız ülke yenilir, çok zayıf ülke işgal edilir (oyun biter).
- **Darbe**: Kamuoyu desteği çöker, öfke ve enflasyon tırmanır, ordu ihmal edilir ya da savaş kaybedilirse "Darbe riski" yükselir (Halk panelinde görünür). Girişim gelirse tanklar sokağa iner, sokağa çıkma yasağı başlar; direniş (halk desteğine bağlı), generallerle pazarlık (askerî vesayet) ya da uluslararası destek (güvenilirliğe bağlı) seçilir. Başarısız direniş oyunu bitirir.
- **Zafer**: Savaş kazanılırsa şehirde havai fişekli, konfetili, bayraklı kutlama ve zafer sahnesi gösterilir.
- **Olaylar**: Fed kararı, petrol şoku, kuraklık, deprem, sermaye kaçışı, IMF, seçim baskısı gibi 25 olay; çoğunda seçim yaparsınız.
- **Senaryolar** (8 adet): Sakin Sular, Kaynak Laneti, 2026 Dezenflasyon Yolu, 2008 Küresel Fırtına, 2018 Kur Fırtınası, 2022 Negatif Reel Faiz, 2001 Kara Şubat, Hiperenflasyon Eşiği. Zor senaryolarda skor katsayısı yüksektir; enflasyonu başlangıca göre düşürmek ilerleme primi kazandırır.
- **Sesler**: Tüm efektler WebAudio ile anlık sentezlenir (dosya yok). Üst bardaki 🔊 düğmesiyle kapatılabilir; tercih hatırlanır.
- **Skor tablosu**: Biten her oyun tarayıcıda (localStorage) saklanır; oyun sonu ekranında adınızı yazıp sıralamada yerinizi görürsünüz. Menü ve başlangıç ekranından en iyi 20 sonuca ulaşılır.
- **Mobil**: Telefonda alt eylem çubuğu (Ay / Çeyrek / Otomatik / Menü), büyük dokunma hedefleri, alt-sayfa modallar ve şehirde dokunarak vatandaş/bina seçimi vardır.
- Her çeyrek sonunda başekonomist rapor sunar. 48 ay sonunda seçim: kamuoyu desteği 50'nin üzerindeyse kazanırsınız.
- Kaybetme koşulları: destek < 15 (istifa), enflasyon > %150 (hiperenflasyon), rezervler tükenirse (dış borç krizi), savaşta başkent düşerse (işgal), darbe başarılı olursa (cunta).

## Kısayollar
Enter veya Boşluk: ayı ilerlet (açık pencerede Enter = Devam) · Shift+Enter: çeyrek sonuna · ↑/↓: faiz ±1 puan

## Dosyalar
- `js/model.js` — aylık makro model (enflasyon, büyüme, kur, rezerv, CDS, bütçe, halk kesimleri)
- `js/war.js` — savaş modülü (savunma/teknoloji birikimi, cephe, savaş kabinesi kararları)
- `js/coup.js` — darbe riski ve darbe girişimi çözümü
- `js/events.js` — olaylar ve karar kartları
- `js/voices.js` — vatandaş sözleri, pankartlar, danışman yorumları
- `js/city.js` — canlı şehir sahnesi (canvas)
- `js/charts.js` — grafikler
- `js/sound.js` — ses efektleri (WebAudio sentez)
- `js/main.js` — arayüz, tur döngüsü, kayıt (localStorage)

Oyun otomatik kaydedilir; menüden yeni oyun başlatabilirsiniz.

## Yayınlama
Oyun herkese açık, giriş gerektirmeyen adreste yayında: **https://atakanatici.github.io/ulkeyi-yonet/**
Kaynak deposu: https://github.com/AtakanAtici/ulkeyi-yonet

Değişiklikleri yayına almak için:

```bash
git add -A && git commit -m "güncelleme" && git push
```

GitHub Pages `main` dalının kökünden yayın yapar; güncelleme 1-2 dakika içinde yansır.
`deploy-github.sh` betiği ilk kurulum içindir (depoyu oluşturur ve Pages'i açar).

Claude Artifacts kopyası (yalnızca sahibi ve paylaşılanlar açabilir): https://claude.ai/artifact/2bWN7ELgyr3RPhFrf2Mgp2
Yayın sayfası `node build-artifact.js` ile `dist/ulkeyi-yonet.html` olarak üretilir.
