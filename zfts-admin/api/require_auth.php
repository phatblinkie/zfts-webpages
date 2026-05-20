<?php
header('Content-Type: application/json');

/* ---------------- Session Setup ---------------- */
require_once __DIR__ . '/session.php';

/* ---------------- Session Timeout ---------------- */
$timeout = 900; // 15 minutes

if (isset($_SESSION['last_activity']) &&
    (time() - $_SESSION['last_activity']) > $timeout) {

    session_unset();
    session_destroy();

    http_response_code(401);
    echo json_encode(['ok'=>false,'err'=>'session expired']);
    exit;
}

/* update last activity timestamp */
$_SESSION['last_activity'] = time();

/* ---------------- Auth Check ---------------- */
if (!isset($_SESSION['auth']) || $_SESSION['auth'] !== true) {
    http_response_code(401);
    echo json_encode(['ok'=>false,'err'=>'unauthorized']);
    exit;
}