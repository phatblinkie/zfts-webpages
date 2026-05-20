<?php
header('Content-Type: application/json');

require_once __DIR__ . '/session.php';
require_once __DIR__ . '/require_auth.php';
require_once __DIR__ . '/csrf_check.php';

/* ---------------- Input ---------------- */
$current = trim($_POST['current_password'] ?? '');
$new     = trim($_POST['new_password'] ?? '');
$confirm = trim($_POST['confirm_password'] ?? '');

if (!$current || !$new || !$confirm) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'err'=>'missing parameters']);
    exit;
}

if ($new !== $confirm) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'err'=>'passwords do not match']);
    exit;
}

/* ---------------- Password Policy ---------------- */
if (strlen($new) < 12 ||
    !preg_match('/[A-Z]/', $new) ||
    !preg_match('/[a-z]/', $new) ||
    !preg_match('/[0-9]/', $new) ||
    !preg_match('/[\W]/', $new)) {

    http_response_code(400);
    echo json_encode([
        'ok'=>false,
        'err'=>'password does not meet complexity requirements'
    ]);
    exit;
}

/* ---------------- Load Current Password ---------------- */
$configPath = __DIR__ . '/../config/settings.json';

$cfg = json_decode(file_get_contents($configPath), true);
$stored = $cfg['admin_pass'] ?? '';

/* ---------------- Verify Current Password ---------------- */
if (!password_verify($current, $stored)) {
    http_response_code(401);
    echo json_encode(['ok'=>false,'err'=>'current password incorrect']);
    exit;
}

/* ---------------- Hash New Password ---------------- */
$newHash = password_hash($new, PASSWORD_DEFAULT);

/* ---------------- Safe Write (atomic) ---------------- */
$cfg['admin_pass'] = $newHash;

$tmpFile = $configPath . '.tmp';
if (file_put_contents($tmpFile, json_encode($cfg, JSON_PRETTY_PRINT)) === false) {
    http_response_code(500);
    echo json_encode(['ok'=>false,'err'=>'failed to write temp file']);
    exit;
}

if (!rename($tmpFile, $configPath)) {
    http_response_code(500);
    echo json_encode(['ok'=>false,'err'=>'failed to update config']);
    exit;
}

/* ---------------- Audit Log (basic) ---------------- */
error_log("PASSWORD CHANGE: user session=" . session_id());

/* ---------------- Success ---------------- */
echo json_encode(['ok'=>true]);