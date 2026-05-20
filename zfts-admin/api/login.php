<?php
header('Content-Type: application/json');

/* ---------------- Session Setup ---------------- */
require_once __DIR__ . '/session.php';

/* ---------------- Input ---------------- */
$pass = trim($_POST['password'] ?? '');

/* ---------------- Load Config ---------------- */
$configPath = __DIR__ . '/../config/settings.json';
$cfg = json_decode(file_get_contents($configPath), true);

if (!is_array($cfg)) {
    $cfg = [];
}

$stored = $cfg['admin_pass'] ?? '';
$maxAttempts = $cfg['login_max_attempts'] ?? 5;
$lockoutTime = $cfg['login_lockout_seconds'] ?? 30;

/* ---------------- Session Rate Limiting ---------------- */
$_SESSION['attempts'] = $_SESSION['attempts'] ?? 0;
$_SESSION['last_attempt'] = $_SESSION['last_attempt'] ?? 0;

$now = time();

/* ---- Reset attempts after timeout ---- */
if ($now - $_SESSION['last_attempt'] > $lockoutTime) {
    $_SESSION['attempts'] = 0;
    $_SESSION['last_attempt'] = 0; // ✅ important fix
}

/* ---- Block if too many attempts ---- */
if ($_SESSION['attempts'] >= $maxAttempts) {
    $retry = $lockoutTime - ($now - $_SESSION['last_attempt']);

    http_response_code(429);
    echo json_encode([
        'ok' => false,
        'err' => 'Too many attempts',
        'retry_after' => max(1, $retry)
    ]);
    exit;
}

/* ---------------- Verify Password ---------------- */
if (password_verify($pass, $stored)) {

    session_regenerate_id(true); // ✅ prevent session fixation
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    $_SESSION['auth'] = true;

    /* ✅ FULL RESET ON SUCCESS */
    $_SESSION['attempts'] = 0;
    $_SESSION['last_attempt'] = 0;
    $_SESSION['last_activity'] = time();

    echo json_encode(['ok' => true]);
    exit;

} else {
    /* ✅ Track failed attempt */
    $_SESSION['attempts']++;
    $_SESSION['last_attempt'] = $now;

    echo json_encode([
        'ok' => false,
        'err' => 'Invalid password'
    ]);
    exit;
}