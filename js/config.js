/* Skor sunucusunun adresi.
   Ortak skor tablosu nationpilot.com üzerindeki SQLite veritabanındadır; oyunun diğer kopyaları
   (ikinci alan adı, GitHub Pages, dosyadan açılan kopya) da aynı tabloya bağlanır.
   Yerel geliştirmede (python3 server/app.py) kendi sunucusu kullanılır. */
(function () {
  var CENTRAL = 'https://nationpilot.com';
  var h = location.hostname;
  var local = h === 'localhost' || h === '127.0.0.1';
  var home = /(^|\.)nationpilot\.com$/.test(h);
  window.ULKE_API = (local || home) ? '' : CENTRAL;
})();
