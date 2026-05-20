<?php

// get token safely across environments
$token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
//error_log("CSRF HEADER: " . ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? 'NONE'));
//error_log("SESSION TOKEN: " . ($_SESSION['csrf_token'] ?? 'NONE'));
if (!isset($_SESSION['csrf_token'])) {
    http_response_code(403);
    echo json_encode(['ok'=>false,'err'=>'missing csrf session']);
    exit;
}

if (!$token || !hash_equals($_SESSION['csrf_token'], $token)) {
    http_response_code(403);
    echo json_encode([
        'ok'=>false,
        'err'=>'invalid csrf token',
        'debug'=>[
            'received'=>$token,
            'expected'=>$_SESSION['csrf_token']
        ]
    ]);
    exit;
}