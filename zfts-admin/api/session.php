<?php

session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => 'zfts.phatsplace.org',  // ✅ consistent
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax'
]);

session_name('ZFTSSESSID');
session_start();

// generate CSRF token if not present
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}