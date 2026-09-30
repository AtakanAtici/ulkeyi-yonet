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
- **Başlangıç asistanı**: İlk açılışta dört adım: karşılama, kullanıcı adı, senaryo, zorluk. Kullanıcı adı sunucuya kaydedilir ve oyuncuya özeldir.
- **Skor tablosu**: Biten her oyun skor sunucusundaki SQLite veritabanına yazılır. "Dünya sıralaması" sekmesi her oyuncunun en iyi skorunu, sıranızı ve senaryo süzgecini gösterir; "Bu cihaz" sekmesi yerel geçmişi tutar. Sunucuya ulaşılamazsa oyun cihazdaki tabloyla çalışmaya devam eder.
- **Mobil**: Telefonda alt eylem çubuğu (Ay / Çeyrek / Otomatik / Menü), büyük dokunma hedefleri, alt-sayfa modallar ve şehirde dokunarak vatandaş/bina seçimi vardır.
- Her çeyrek sonunda başekonomist rapor sunar. 48 ay sonunda seçim: kamuoyu desteği 50'nin üzerindeyse kazanırsınız.
- Kaybetme koşulları: destek < 15 (istifa), enflasyon > %150 (hiperenflasyon), rezervler tükenirse (dış borç krizi), savaşta başkent düşerse (işgal), darbe başarılı olursa (cunta).

## Kısayollar
Enter veya Boşluk: ayı ilerlet (açık pencerede Enter = Devam) · Shift+Enter: çeyrek sonuna · ↑/↓: faiz ±1 puan

## Skor sunucusu (SQLite)
Aynı API iki biçimde gelir: yayın için PHP (`api/index.php`), yerel geliştirme için Python (`server/app.py`). Python sürümü yalnızca standart kütüphaneyi kullanır; kurulum gerekmez.

```bash
python3 server/app.py --port 8765
```

Bu komut hem oyunu hem `/api` uç noktalarını sunar; veritabanı `server/data/scores.db` dosyasıdır (`ULKE_DB` ortam değişkeniyle değiştirilebilir).

| Uç nokta | Açıklama |
|---|---|
| `GET /api/health` | Sunucu ve SQLite sürümü |
| `GET /api/players/check?name=` | Kullanıcı adı uygun mu |
| `POST /api/players` | Kullanıcı adını kaydeder, oyuncuya özel anahtar döner |
| `POST /api/scores` | Oyun sonucunu kaydeder (anahtar gerekir) |
| `GET /api/scores?scenario=all&limit=20&player=` | Her oyuncunun en iyi skoru ve sıranız |

Korumalar: parametreli SQL, ad biçimi denetimi, büyük/küçük harf duyarsız benzersiz ad, anahtarın yalnızca özeti saklanır, istek sınırı, skor üst sınırı denetimi. Skorlar oyuncunun tarayıcısında hesaplandığı için kararlı bir hilecinin sahte skor göndermesi tamamen engellenemez.

### Plesk (Linux) üzerinde yayınlama
Plesk'te PHP hazır geldiği için ayrı servis kurmaya gerek yoktur: `api/index.php`, Python sunucusuyla aynı uç noktaları ve aynı SQLite şemasını sunar.

1. **Dosyaları alın.** Plesk > Web Siteleri ve Alan Adları > ilgili alan adı > **Git** > depo ekle: `https://github.com/AtakanAtici/ulkeyi-yonet.git`, dal `main`, dağıtım klasörü `httpdocs`, dağıtım kipi otomatik. Plesk'in verdiği webhook adresini GitHub deposuna eklerseniz her `git push` siteyi günceller. Git eklentisi yoksa depo dosyalarını `httpdocs` içine yükleyin.
2. **PHP.** Alan adının PHP ayarlarında PHP 7.4 ya da üstü seçili olsun; `pdo_sqlite` eklentisi etkin olmalı (Plesk'te varsayılan olarak etkindir).
3. **Doğrulayın.** `https://ALANADI/api/health` adresi `{"ok":true,"db":"sqlite",...}` döndürmeli. Yönlendirme kapalıysa `https://ALANADI/api/index.php?r=/health` çalışır; oyun hangisi çalışıyorsa onu kendiliğinden kullanır.
4. **SSL.** Plesk'in Let's Encrypt eklentisiyle sertifika alın.

Veritabanı web kökünün dışında, `/var/www/vhosts/ALANADI/ulkeyi-yonet-data/scores.db` dosyasında oluşur (klasör ilk istekte kendiliğinden açılır; `ULKE_DB_DIR` ortam değişkeniyle değiştirilebilir). Yedek almak için bu dosyayı kopyalamak yeterlidir. `.htaccess` kaynak klasörlerini (`server/`, `.git`) ve veri dosyalarını dışarıya kapatır.

`js/config.js` içindeki `window.ULKE_API` boş bırakılırsa oyun açıldığı alan adındaki API'yi kullanır; Plesk'te değiştirmeniz gerekmez. GitHub Pages kopyasının da aynı tabloyu kullanması istenirse buraya Plesk adresi yazılır.

## Dosyalar
- `js/model.js` — aylık makro model (enflasyon, büyüme, kur, rezerv, CDS, bütçe, halk kesimleri)
- `js/war.js` — savaş modülü (savunma/teknoloji birikimi, cephe, savaş kabinesi kararları)
- `js/coup.js` — darbe riski ve darbe girişimi çözümü
- `js/events.js` — olaylar ve karar kartları
- `js/voices.js` — vatandaş sözleri, pankartlar, danışman yorumları
- `js/city.js` — canlı şehir sahnesi (canvas)
- `js/charts.js` — grafikler
- `js/sound.js` — ses efektleri (WebAudio sentez)
- `js/api.js`, `js/config.js` — skor sunucusu istemcisi ve adres ayarı
- `api/index.php` — skor API'si (PHP + SQLite; Plesk ve benzeri barındırmalar)
- `server/app.py` — aynı API'nin Python sürümü (yerel geliştirme; oyunu da sunar)
- `.htaccess` — temiz API adresleri ve kaynak klasörlerinin korunması
- `assets/logo.svg` — logo
- `js/main.js` — arayüz, başlangıç asistanı, tur döngüsü, kayıt (localStorage)

Oyun otomatik kaydedilir; menüden yeni oyun başlatabilirsiniz.

## Yayınlama
Canlı adresler (Plesk, Deva Genel Hosting):
- **https://nationpilot.com/** (oyun + SQLite skor API'si)
- **https://yonetbakalim.com.tr/** (dosyalar yüklü; alan adının DNS kaydı sunucuya yönlendirildiğinde açılır)

Her iki alan adında Plesk Git eklentisi bu depoyu `main` dalından `httpdocs` klasörüne dağıtır. Değişiklikleri yayına almak için:

```bash
git add -A && git commit -m "güncelleme" && git push
```

Ardından Plesk > alan adı > Git > **Pull now** (ya da Plesk'in verdiği webhook adresi GitHub deposuna eklenirse kendiliğinden).

Diğer kopyalar: GitHub Pages https://atakanatici.github.io/ulkeyi-yonet/ (skor sunucusu olmadan, cihaz tablosuyla çalışır). Kaynak: https://github.com/AtakanAtici/ulkeyi-yonet
