#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ülkeyi Yönet — skor sunucusu (SQLite)

Sıfır bağımlılık: yalnızca Python standart kütüphanesi (sqlite3 + WSGI).

Yerelde çalıştırma (oyunu da sunar):
    python3 server/app.py --port 8765

WSGI barındırma (ör. PythonAnywhere): bu dosyadaki `application` nesnesini kullanın.

Uç noktalar:
    GET  /api/health
    GET  /api/players/check?name=...
    POST /api/players            {"name": "..."}            -> {id, name, token}
    POST /api/scores             {"token": "...", ...skor}  -> {id, rank, best}
    GET  /api/scores?scenario=all&limit=20&player=<ad>      -> {top: [...], me: {...}, total}
"""
import hashlib
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from urllib.parse import parse_qs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get('ULKE_DB', os.path.join(ROOT, 'server', 'data', 'scores.db'))
ALLOW_ORIGIN = os.environ.get('ULKE_ALLOW_ORIGIN', '*')
MAX_BODY = 4096

SCENARIOS = {'sakin', 'kaynak', 'dezenflasyon', 'kriz2008', 'kursoku', 'stagflasyon', 'kriz2001', 'hiper'}
DIFFICULTIES = {'kolay', 'orta', 'zor'}
GRADES = {'S', 'A', 'B', 'C', 'D', 'F'}
OUTCOMES = {'secim_zafer', 'secim_yenilgi', 'istifa', 'hiper', 'temerrut', 'isgal', 'darbe'}
NAME_RE = re.compile(r"^[0-9A-Za-zÇĞİÖŞÜçğıöşü _.\-]{3,20}$")

_local = threading.local()
_rate = {}
_rate_lock = threading.Lock()


# ----------------------------------------------------------------- veritabanı
def db():
    """İstek başına tek bağlantı; istek bitince close_db() kapatır."""
    conn = getattr(_local, 'conn', None)
    if conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA foreign_keys=ON')
        _local.conn = conn
    return conn


def close_db():
    conn = getattr(_local, 'conn', None)
    if conn is not None:
        try:
            conn.rollback()  # yarım kalan işlem kilit bırakmasın
            conn.close()
        except sqlite3.Error:
            pass
        _local.conn = None


_db_ready = False


def init_db():
    global _db_ready
    if _db_ready:
        return
    conn = db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS players (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            name_key    TEXT NOT NULL UNIQUE,
            token_hash  TEXT NOT NULL,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS scores (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            scenario    TEXT NOT NULL,
            difficulty  TEXT NOT NULL,
            score       INTEGER NOT NULL,
            per_month   INTEGER NOT NULL,
            grade       TEXT NOT NULL,
            outcome     TEXT NOT NULL,
            turns       INTEGER NOT NULL,
            infl_start  REAL,
            infl_end    REAL,
            war         TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
        CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id);
        CREATE INDEX IF NOT EXISTS idx_scores_scenario ON scores(scenario, score DESC);
    """)
    conn.commit()
    _db_ready = True


def name_key(name):
    # Türkçe büyük/küçük harf farkını da yok say: "İ" -> "i", "I" -> "ı"
    return ' '.join(name.replace('İ', 'i').replace('I', 'ı').casefold().split())


def hash_token(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


# ----------------------------------------------------------------- yardımcılar
class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def rate_limit(ip, limit=30, window=60):
    now = time.time()
    with _rate_lock:
        hits = [t for t in _rate.get(ip, []) if now - t < window]
        if len(hits) >= limit:
            _rate[ip] = hits
            raise ApiError(429, 'Çok fazla istek. Bir dakika sonra tekrar deneyin.')
        hits.append(now)
        _rate[ip] = hits
        if len(_rate) > 5000:  # bellek koruması
            for k in list(_rate)[:2500]:
                _rate.pop(k, None)


def read_json(environ):
    try:
        length = int(environ.get('CONTENT_LENGTH') or 0)
    except ValueError:
        length = 0
    if length <= 0 or length > MAX_BODY:
        raise ApiError(400, 'Geçersiz istek gövdesi.')
    try:
        data = json.loads(environ['wsgi.input'].read(length).decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        raise ApiError(400, 'JSON okunamadı.')
    if not isinstance(data, dict):
        raise ApiError(400, 'JSON nesnesi bekleniyor.')
    return data


def clean_name(raw):
    name = ' '.join(str(raw or '').split())
    if not NAME_RE.match(name):
        raise ApiError(400, 'Kullanıcı adı 3-20 karakter olmalı; harf, rakam, boşluk, nokta, tire ve alt çizgi kullanılabilir.')
    return name


def num(data, key, lo, hi, integer=True, required=True):
    v = data.get(key)
    if v is None:
        if required:
            raise ApiError(400, f'Eksik alan: {key}')
        return None
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ApiError(400, f'Geçersiz alan: {key}')
    if v != v or v < lo or v > hi:  # NaN ve aralık
        raise ApiError(400, f'Aralık dışı alan: {key}')
    return int(round(v)) if integer else float(v)


def choice(data, key, allowed):
    v = data.get(key)
    if v not in allowed:
        raise ApiError(400, f'Geçersiz alan: {key}')
    return v


# ----------------------------------------------------------------- uç noktalar
def api_check_name(query):
    name = clean_name((query.get('name') or [''])[0])
    row = db().execute('SELECT 1 FROM players WHERE name_key = ?', (name_key(name),)).fetchone()
    return {'name': name, 'available': row is None}


def api_register(environ, ip):
    rate_limit(ip, limit=10)
    data = read_json(environ)
    name = clean_name(data.get('name'))
    token = secrets.token_urlsafe(24)
    conn = db()
    try:
        cur = conn.execute('INSERT INTO players (name, name_key, token_hash) VALUES (?, ?, ?)',
                           (name, name_key(name), hash_token(token)))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise ApiError(409, 'Bu kullanıcı adı alınmış. Başka bir ad deneyin.')
    return {'id': cur.lastrowid, 'name': name, 'token': token}


def player_by_token(token):
    if not isinstance(token, str) or not (16 <= len(token) <= 80):
        raise ApiError(401, 'Oturum geçersiz. Kullanıcı adınızı yeniden kaydedin.')
    row = db().execute('SELECT id, name FROM players WHERE token_hash = ?', (hash_token(token),)).fetchone()
    if row is None:
        raise ApiError(401, 'Oturum geçersiz. Kullanıcı adınızı yeniden kaydedin.')
    return row


def best_rank(conn, player_id, scenario=None):
    where, args = '', []
    if scenario:
        where, args = 'WHERE scenario = ?', [scenario]
    best = conn.execute(f'SELECT MAX(score) AS b, COUNT(*) AS n FROM scores {where} {"AND" if where else "WHERE"} player_id = ?',
                        args + [player_id]).fetchone()
    if best['b'] is None:
        return None
    better = conn.execute(
        f'SELECT COUNT(*) AS c FROM (SELECT player_id, MAX(score) AS b FROM scores {where} GROUP BY player_id) WHERE b > ?',
        args + [best['b']]).fetchone()['c']
    return {'best': best['b'], 'rank': better + 1, 'games': best['n']}


def api_submit(environ, ip):
    rate_limit(ip, limit=20)
    data = read_json(environ)
    player = player_by_token(data.get('token'))
    scenario = choice(data, 'scenario', SCENARIOS)
    difficulty = choice(data, 'difficulty', DIFFICULTIES)
    grade = choice(data, 'grade', GRADES)
    outcome = choice(data, 'outcome', OUTCOMES)
    turns = num(data, 'turns', 1, 48)
    score = num(data, 'score', -40000, 12000)
    # aylık skor modelde en fazla 130 x 1,5 x 1,15; savaş/darbe primleriyle birlikte üst sınır
    if score > turns * 230 + 600:
        raise ApiError(400, 'Skor doğrulanamadı.')
    per_month = int(round(score / max(1, turns)))
    infl_start = num(data, 'inflStart', 0, 300, integer=False, required=False)
    infl_end = num(data, 'inflEnd', 0, 300, integer=False, required=False)
    war = data.get('war')
    if war is not None and war not in ('zafer', 'ateskes', 'yenilgi', 'isgal'):
        war = None
    conn = db()
    # aynı oyuncunun çok hızlı art arda kayıt göndermesini engelle
    last = conn.execute("SELECT (julianday('now') - julianday(created_at)) * 86400 AS s FROM scores WHERE player_id = ? ORDER BY id DESC LIMIT 1",
                        (player['id'],)).fetchone()
    if last is not None and last['s'] is not None and last['s'] < 5:
        raise ApiError(429, 'Çok hızlı kayıt gönderildi.')
    cur = conn.execute(
        'INSERT INTO scores (player_id, scenario, difficulty, score, per_month, grade, outcome, turns, infl_start, infl_end, war) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (player['id'], scenario, difficulty, score, per_month, grade, outcome, turns, infl_start, infl_end, war))
    conn.commit()
    better = conn.execute('SELECT COUNT(*) AS c FROM scores WHERE score > ?', (score,)).fetchone()['c']
    return {'id': cur.lastrowid, 'name': player['name'], 'position': better + 1, 'me': best_rank(conn, player['id'])}


def api_scores(query):
    scenario = (query.get('scenario') or ['all'])[0]
    if scenario != 'all' and scenario not in SCENARIOS:
        raise ApiError(400, 'Geçersiz senaryo.')
    try:
        limit = max(1, min(50, int((query.get('limit') or ['20'])[0])))
    except ValueError:
        limit = 20
    conn = db()
    where, args = ('', []) if scenario == 'all' else ('WHERE s.scenario = ?', [scenario])
    # her oyuncunun en iyi skoru (SQLite: MAX ile birlikte gelen çıplak sütunlar o satırdan alınır)
    rows = conn.execute(
        f'SELECT p.name, s.scenario, s.difficulty, MAX(s.score) AS score, s.per_month, s.grade, s.outcome, s.turns, '
        f's.infl_start, s.infl_end, s.war, s.created_at, COUNT(*) AS games '
        f'FROM scores s JOIN players p ON p.id = s.player_id {where} '
        f'GROUP BY s.player_id ORDER BY score DESC, s.created_at ASC LIMIT ?', args + [limit]).fetchall()
    top = [{'rank': i + 1, 'name': r['name'], 'scenario': r['scenario'], 'difficulty': r['difficulty'], 'score': r['score'],
            'perMonth': r['per_month'], 'grade': r['grade'], 'outcome': r['outcome'], 'turns': r['turns'],
            'inflStart': r['infl_start'], 'inflEnd': r['infl_end'], 'war': r['war'], 'date': r['created_at'], 'games': r['games']}
           for i, r in enumerate(rows)]
    total = conn.execute(f'SELECT COUNT(DISTINCT s.player_id) AS c FROM scores s {where}', args).fetchone()['c']
    me = None
    pname = (query.get('player') or [''])[0]
    if pname:
        prow = conn.execute('SELECT id, name FROM players WHERE name_key = ?', (name_key(pname),)).fetchone()
        if prow is not None:
            me = best_rank(conn, prow['id'], None if scenario == 'all' else scenario)
            if me:
                me['name'] = prow['name']
    players = conn.execute('SELECT COUNT(*) AS c FROM players').fetchone()['c']
    return {'top': top, 'total': total, 'players': players, 'me': me, 'scenario': scenario}


# ----------------------------------------------------------------- WSGI
def cors_headers():
    return [('Access-Control-Allow-Origin', ALLOW_ORIGIN), ('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'),
            ('Access-Control-Allow-Headers', 'Content-Type'), ('Access-Control-Max-Age', '86400')]


def json_response(start_response, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    reason = {200: 'OK', 201: 'Created', 400: 'Bad Request', 401: 'Unauthorized', 404: 'Not Found', 405: 'Method Not Allowed',
              409: 'Conflict', 429: 'Too Many Requests', 500: 'Internal Server Error'}.get(status, 'OK')
    start_response(f'{status} {reason}', [('Content-Type', 'application/json; charset=utf-8'), ('Content-Length', str(len(body))),
                                          ('Cache-Control', 'no-store')] + cors_headers())
    return [body]


STATIC_DENY = ('server', '.git', '.claude', 'node_modules')


def serve_static(path, start_response):
    rel = path.lstrip('/') or 'index.html'
    full = os.path.normpath(os.path.join(ROOT, rel))
    parts = os.path.relpath(full, ROOT).split(os.sep)
    if not full.startswith(ROOT + os.sep) or parts[0] in STATIC_DENY or parts[0].startswith('.'):
        return json_response(start_response, 404, {'error': 'Bulunamadı.'})
    if os.path.isdir(full):
        full = os.path.join(full, 'index.html')
    if not os.path.isfile(full):
        return json_response(start_response, 404, {'error': 'Bulunamadı.'})
    ctype = mimetypes.guess_type(full)[0] or 'application/octet-stream'
    if ctype.startswith('text/') or ctype in ('application/javascript', 'application/json', 'image/svg+xml'):
        ctype += '; charset=utf-8'
    with open(full, 'rb') as f:
        body = f.read()
    start_response('200 OK', [('Content-Type', ctype), ('Content-Length', str(len(body))), ('Cache-Control', 'no-cache')])
    return [body]


def application(environ, start_response):
    method = environ.get('REQUEST_METHOD', 'GET')
    path = environ.get('PATH_INFO', '/')
    query = parse_qs(environ.get('QUERY_STRING', ''))
    ip = (environ.get('HTTP_X_FORWARDED_FOR') or environ.get('REMOTE_ADDR') or '?').split(',')[0].strip()
    if not path.startswith('/api/'):
        if method not in ('GET', 'HEAD'):
            return json_response(start_response, 405, {'error': 'Yöntem desteklenmiyor.'})
        return serve_static(path, start_response)
    if method == 'OPTIONS':
        start_response('204 No Content', cors_headers() + [('Content-Length', '0')])
        return [b'']
    try:
        init_db()
        if path == '/api/health' and method == 'GET':
            return json_response(start_response, 200, {'ok': True, 'db': 'sqlite', 'version': sqlite3.sqlite_version})
        if path == '/api/players/check' and method == 'GET':
            return json_response(start_response, 200, api_check_name(query))
        if path == '/api/players' and method == 'POST':
            return json_response(start_response, 201, api_register(environ, ip))
        if path == '/api/scores' and method == 'POST':
            return json_response(start_response, 201, api_submit(environ, ip))
        if path == '/api/scores' and method == 'GET':
            return json_response(start_response, 200, api_scores(query))
        return json_response(start_response, 404, {'error': 'Bulunamadı.'})
    except ApiError as e:
        return json_response(start_response, e.status, {'error': e.message})
    except Exception as e:  # beklenmeyen hata: ayrıntıyı sunucu günlüğüne yaz, istemciye verme
        print('HATA:', repr(e), file=sys.stderr)
        return json_response(start_response, 500, {'error': 'Sunucu hatası.'})
    finally:
        close_db()


if __name__ == '__main__':
    import argparse
    from socketserver import ThreadingMixIn
    from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server

    class ThreadedServer(ThreadingMixIn, WSGIServer):
        daemon_threads = True

    class QuietHandler(WSGIRequestHandler):
        def log_message(self, fmt, *args):
            sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))

    ap = argparse.ArgumentParser(description='Ülkeyi Yönet skor sunucusu')
    ap.add_argument('--port', type=int, default=int(os.environ.get('PORT', 8765)))
    ap.add_argument('--host', default=os.environ.get('HOST', '127.0.0.1'))
    a = ap.parse_args()
    init_db()
    close_db()
    print(f'Ülkeyi Yönet: http://{a.host}:{a.port}  (veritabanı: {DB_PATH})')
    make_server(a.host, a.port, application, server_class=ThreadedServer, handler_class=QuietHandler).serve_forever()
