// Yayın sayfasını index.html'den üretir: node build-artifact.js
const fs = require('fs');
const h = fs.readFileSync('index.html', 'utf8');
const body = h.slice(h.indexOf('<body>') + 6, h.indexOf('</body>'));
const page = '<title>Ülkeyi Yönet</title>\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">\n<link rel="stylesheet" href="css/style.css">\n<style>html, body { background: var(--bg); }</style>\n' + body.trim() + '\n';
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/ulkeyi-yonet.html', page);
console.log('dist/ulkeyi-yonet.html yazıldı');
