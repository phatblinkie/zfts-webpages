<?php
header('Content-Type: application/json');

require_once __DIR__ . '/session.php';

echo json_encode([
  'authenticated' => isset($_SESSION['auth']) && $_SESSION['auth'] === true,
  'csrf_token' => $_SESSION['csrf_token']
]);