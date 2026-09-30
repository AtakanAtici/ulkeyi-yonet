<?php
/**
 * Ülkeyi Yönet — skor API'si (PHP + SQLite)
 * Plesk ve benzeri PHP barındırmalar için. server/app.py ile aynı uç noktalar ve aynı şema.
 *
 *   GET  api/health                      (ya da api/index.php?r=/health)
 *   GET  api/players/check?name=...
 *   POST api/players     {"name": "..."}            -> {id, name, token}
 *   POST api/scores      {"token": "...", ...skor}  -> {id, position, me}
 *   GET  api/scores?scenario=all&limit=20&player=<ad>
 *
 * Veritabanı web kökünün DIŞINDA tutulur: <vhost>/ulkeyi-yonet-data/scores.db
 * (ULKE_DB_DIR ortam değişkeniyle değiştirilebilir). Oraya yazılamazsa api/data/ kullanılır
 * ve .htaccess ile dışarıya kapatılır.
 */
declare(strict_types=1);

const MAX_BODY = 4096;
const SCENARIOS = ['sakin', 'kaynak', 'dezenflasyon', 'kriz2008', 'kursoku', 'stagflasyon', 'kriz2001', 'hiper'];
const DIFFICULTIES = ['kolay', 'orta', 'zor'];
const GRADES = ['S', 'A', 'B', 'C', 'D', 'F'];
const OUTCOMES = ['secim_zafer', 'secim_yenilgi', 'istifa', 'hiper', 'temerrut', 'isgal', 'darbe'];
const WARS = ['zafer', 'ateskes', 'yenilgi', 'isgal'];
const NAME_RE = '/^[0-9A-Za-zÇĞİÖŞÜçğıöşü _.\-]{3,20}$/u';

class ApiError extends Exception
{
    public int $status;
    public function __construct(int $status, string $message)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

function respond(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function cors(): void
{
    header('Access-Control-Allow-Origin: ' . (getenv('ULKE_ALLOW_ORIGIN') ?: '*'));
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
    header('X-Content-Type-Options: nosniff');
}

// ----------------------------------------------------------------- veritabanı
function db_dir(): string
{
    $candidates = [];
    if ($env = getenv('ULKE_DB_DIR')) {
        $candidates[] = $env;
    }
    $docroot = isset($_SERVER['DOCUMENT_ROOT']) ? rtrim((string) $_SERVER['DOCUMENT_ROOT'], '/') : '';
    if ($docroot !== '') {
        $candidates[] = dirname($docroot) . '/ulkeyi-yonet-data';   // web kökünün dışında
    }
    $candidates[] = __DIR__ . '/data';                              // yedek: .htaccess ile kapalı
    foreach ($candidates as $dir) {
        if ((is_dir($dir) || @mkdir($dir, 0750, true)) && is_writable($dir)) {
            if ($dir === __DIR__ . '/data' && !is_file($dir . '/.htaccess')) {
                @file_put_contents($dir . '/.htaccess', "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n");
                @file_put_contents($dir . '/index.html', '');
            }
            return $dir;
        }
    }
    throw new ApiError(500, 'Veritabanı klasörü yazılabilir değil.');
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    if (!extension_loaded('pdo_sqlite')) {
        throw new ApiError(500, 'Sunucuda PHP pdo_sqlite eklentisi etkin değil.');
    }
    $pdo = new PDO('sqlite:' . db_dir() . '/scores.db');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->setAttribute(PDO::ATTR_TIMEOUT, 10);
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec('PRAGMA foreign_keys=ON');
    $pdo->exec("
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
        CREATE TABLE IF NOT EXISTS rate (ip TEXT NOT NULL, ts INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_rate ON rate(ip, ts);
    ");
    return $pdo;
}

// ----------------------------------------------------------------- yardımcılar
function name_key(string $name): string
{
    $n = str_replace(['İ', 'I'], ['i', 'ı'], $name);   // Türkçe büyük/küçük harf
    $n = mb_strtolower($n, 'UTF-8');
    return trim((string) preg_replace('/\s+/u', ' ', $n));
}

function clean_name($raw): string
{
    $name = trim((string) preg_replace('/\s+/u', ' ', is_string($raw) ? $raw : ''));
    if (!preg_match(NAME_RE, $name)) {
        throw new ApiError(400, 'Kullanıcı adı 3-20 karakter olmalı; harf, rakam, boşluk, nokta, tire ve alt çizgi kullanılabilir.');
    }
    return $name;
}

function rate_limit(int $limit = 30, int $window = 60): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '?');
    $now = time();
    $pdo = db();
    $st = $pdo->prepare('SELECT COUNT(*) FROM rate WHERE ip = ? AND ts > CAST(? AS INTEGER)');
    $st->execute([$ip, $now - $window]);
    if ((int) $st->fetchColumn() >= $limit) {
        throw new ApiError(429, 'Çok fazla istek. Bir dakika sonra tekrar deneyin.');
    }
    $pdo->prepare('INSERT INTO rate (ip, ts) VALUES (?, ?)')->execute([$ip, $now]);
    if (random_int(1, 50) === 1) {
        $pdo->prepare('DELETE FROM rate WHERE ts < ?')->execute([$now - 3600]);
    }
}

function read_json(): array
{
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
    if ($raw === false || $raw === '' || strlen($raw) > MAX_BODY) {
        throw new ApiError(400, 'Geçersiz istek gövdesi.');
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new ApiError(400, 'JSON okunamadı.');
    }
    return $data;
}

function num(array $data, string $key, float $lo, float $hi, bool $integer = true, bool $required = true)
{
    if (!array_key_exists($key, $data) || $data[$key] === null) {
        if ($required) {
            throw new ApiError(400, "Eksik alan: $key");
        }
        return null;
    }
    $v = $data[$key];
    if (!is_int($v) && !is_float($v)) {
        throw new ApiError(400, "Geçersiz alan: $key");
    }
    if (is_nan((float) $v) || $v < $lo || $v > $hi) {
        throw new ApiError(400, "Aralık dışı alan: $key");
    }
    return $integer ? (int) round($v) : (float) $v;
}

function choice(array $data, string $key, array $allowed): string
{
    $v = $data[$key] ?? null;
    if (!is_string($v) || !in_array($v, $allowed, true)) {
        throw new ApiError(400, "Geçersiz alan: $key");
    }
    return $v;
}

function best_rank(int $playerId, ?string $scenario = null): ?array
{
    $pdo = db();
    $where = $scenario ? 'WHERE scenario = ?' : '';
    $args = $scenario ? [$scenario] : [];
    $st = $pdo->prepare("SELECT MAX(score) AS b, COUNT(*) AS n FROM scores $where " . ($where ? 'AND' : 'WHERE') . ' player_id = ?');
    $st->execute(array_merge($args, [$playerId]));
    $best = $st->fetch();
    if ($best['b'] === null) {
        return null;
    }
    // PDO parametreleri metin olarak bağlar; toplam ifadesinde tür dönüşümü olmadığı için tamsayıya çevir
    $st = $pdo->prepare("SELECT COUNT(*) FROM (SELECT player_id, MAX(score) AS b FROM scores $where GROUP BY player_id) WHERE b > CAST(? AS INTEGER)");
    $st->execute(array_merge($args, [$best['b']]));
    return ['best' => (int) $best['b'], 'rank' => (int) $st->fetchColumn() + 1, 'games' => (int) $best['n']];
}

// ----------------------------------------------------------------- uç noktalar
function api_health(): array
{
    $v = db()->query('SELECT sqlite_version()')->fetchColumn();
    return ['ok' => true, 'db' => 'sqlite', 'version' => $v, 'server' => 'php'];
}

function api_check_name(): array
{
    $name = clean_name($_GET['name'] ?? '');
    $st = db()->prepare('SELECT 1 FROM players WHERE name_key = ?');
    $st->execute([name_key($name)]);
    return ['name' => $name, 'available' => $st->fetchColumn() === false];
}

function api_register(): array
{
    rate_limit(10);
    $data = read_json();
    $name = clean_name($data['name'] ?? '');
    $token = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
    $pdo = db();
    try {
        $pdo->prepare('INSERT INTO players (name, name_key, token_hash) VALUES (?, ?, ?)')
            ->execute([$name, name_key($name), hash('sha256', $token)]);
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'UNIQUE') !== false) {
            throw new ApiError(409, 'Bu kullanıcı adı alınmış. Başka bir ad deneyin.');
        }
        throw $e;
    }
    return ['id' => (int) $pdo->lastInsertId(), 'name' => $name, 'token' => $token];
}

function api_submit(): array
{
    rate_limit(20);
    $data = read_json();
    $token = $data['token'] ?? null;
    if (!is_string($token) || strlen($token) < 16 || strlen($token) > 80) {
        throw new ApiError(401, 'Oturum geçersiz. Kullanıcı adınızı yeniden kaydedin.');
    }
    $pdo = db();
    $st = $pdo->prepare('SELECT id, name FROM players WHERE token_hash = ?');
    $st->execute([hash('sha256', $token)]);
    $player = $st->fetch();
    if (!$player) {
        throw new ApiError(401, 'Oturum geçersiz. Kullanıcı adınızı yeniden kaydedin.');
    }
    $scenario = choice($data, 'scenario', SCENARIOS);
    $difficulty = choice($data, 'difficulty', DIFFICULTIES);
    $grade = choice($data, 'grade', GRADES);
    $outcome = choice($data, 'outcome', OUTCOMES);
    $turns = num($data, 'turns', 1, 48);
    $score = num($data, 'score', -40000, 12000);
    // aylık skor modelde en fazla 130 x 1,5 x 1,15; savaş/darbe primleriyle birlikte üst sınır
    if ($score > $turns * 230 + 600) {
        throw new ApiError(400, 'Skor doğrulanamadı.');
    }
    $perMonth = (int) round($score / max(1, $turns));
    $inflStart = num($data, 'inflStart', 0, 300, false, false);
    $inflEnd = num($data, 'inflEnd', 0, 300, false, false);
    $war = isset($data['war']) && is_string($data['war']) && in_array($data['war'], WARS, true) ? $data['war'] : null;

    $st = $pdo->prepare("SELECT (julianday('now') - julianday(created_at)) * 86400 AS s FROM scores WHERE player_id = ? ORDER BY id DESC LIMIT 1");
    $st->execute([$player['id']]);
    $last = $st->fetch();
    if ($last && $last['s'] !== null && (float) $last['s'] < 5) {
        throw new ApiError(429, 'Çok hızlı kayıt gönderildi.');
    }
    $pdo->prepare('INSERT INTO scores (player_id, scenario, difficulty, score, per_month, grade, outcome, turns, infl_start, infl_end, war) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$player['id'], $scenario, $difficulty, $score, $perMonth, $grade, $outcome, $turns, $inflStart, $inflEnd, $war]);
    $id = (int) $pdo->lastInsertId();
    $st = $pdo->prepare('SELECT COUNT(*) FROM scores WHERE score > CAST(? AS INTEGER)');
    $st->execute([$score]);
    return ['id' => $id, 'name' => $player['name'], 'position' => (int) $st->fetchColumn() + 1, 'me' => best_rank((int) $player['id'])];
}

function api_scores(): array
{
    $scenario = (string) ($_GET['scenario'] ?? 'all');
    if ($scenario !== 'all' && !in_array($scenario, SCENARIOS, true)) {
        throw new ApiError(400, 'Geçersiz senaryo.');
    }
    $limit = max(1, min(50, (int) ($_GET['limit'] ?? 20)));
    $pdo = db();
    $where = $scenario === 'all' ? '' : 'WHERE s.scenario = ?';
    $args = $scenario === 'all' ? [] : [$scenario];
    // her oyuncunun en iyi skoru (SQLite: MAX ile birlikte gelen çıplak sütunlar o satırdan alınır)
    $st = $pdo->prepare(
        "SELECT p.name, s.scenario, s.difficulty, MAX(s.score) AS score, s.per_month, s.grade, s.outcome, s.turns,
                s.infl_start, s.infl_end, s.war, s.created_at, COUNT(*) AS games
         FROM scores s JOIN players p ON p.id = s.player_id $where
         GROUP BY s.player_id ORDER BY score DESC, s.created_at ASC LIMIT $limit"
    );
    $st->execute($args);
    $top = [];
    foreach ($st->fetchAll() as $i => $r) {
        $top[] = [
            'rank' => $i + 1, 'name' => $r['name'], 'scenario' => $r['scenario'], 'difficulty' => $r['difficulty'],
            'score' => (int) $r['score'], 'perMonth' => (int) $r['per_month'], 'grade' => $r['grade'], 'outcome' => $r['outcome'],
            'turns' => (int) $r['turns'], 'inflStart' => $r['infl_start'] === null ? null : (float) $r['infl_start'],
            'inflEnd' => $r['infl_end'] === null ? null : (float) $r['infl_end'], 'war' => $r['war'], 'date' => $r['created_at'],
            'games' => (int) $r['games'],
        ];
    }
    $st = $pdo->prepare("SELECT COUNT(DISTINCT s.player_id) FROM scores s $where");
    $st->execute($args);
    $total = (int) $st->fetchColumn();
    $me = null;
    $pname = (string) ($_GET['player'] ?? '');
    if ($pname !== '') {
        $st = $pdo->prepare('SELECT id, name FROM players WHERE name_key = ?');
        $st->execute([name_key($pname)]);
        if ($prow = $st->fetch()) {
            $me = best_rank((int) $prow['id'], $scenario === 'all' ? null : $scenario);
            if ($me) {
                $me['name'] = $prow['name'];
            }
        }
    }
    $players = (int) $pdo->query('SELECT COUNT(*) FROM players')->fetchColumn();
    return ['top' => $top, 'total' => $total, 'players' => $players, 'me' => $me, 'scenario' => $scenario];
}

// ----------------------------------------------------------------- yönlendirme
cors();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
$route = isset($_GET['r']) && is_string($_GET['r']) ? $_GET['r'] : (string) ($_SERVER['PATH_INFO'] ?? '');
$route = '/' . trim($route, '/');

try {
    if ($route === '/health' && $method === 'GET') {
        respond(200, api_health());
    } elseif ($route === '/players/check' && $method === 'GET') {
        respond(200, api_check_name());
    } elseif ($route === '/players' && $method === 'POST') {
        respond(201, api_register());
    } elseif ($route === '/scores' && $method === 'POST') {
        respond(201, api_submit());
    } elseif ($route === '/scores' && $method === 'GET') {
        respond(200, api_scores());
    }
    respond(404, ['error' => 'Bulunamadı.']);
} catch (ApiError $e) {
    respond($e->status, ['error' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('ulkeyi-yonet api: ' . $e->getMessage());   // ayrıntı günlüğe, istemciye değil
    respond(500, ['error' => 'Sunucu hatası.']);
}
