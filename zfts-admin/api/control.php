<?php
require_once __DIR__ . '/session.php';      // ✅ start session first
require_once __DIR__ . '/require_auth.php';
require_once __DIR__ . '/csrf_check.php';

header('Content-Type: application/json');
//error_log("CONTROL HIT");

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok'=>false,'err'=>'POST required']); exit;
}

$service = preg_replace('/[^a-z0-9\-]/i','',$_POST['service'] ?? '');
$action  = preg_replace('/[^a-z]/i','',$_POST['action'] ?? '');

if (!preg_match('/^(zfts|zcompd)-(83|89|105|107)$/',$service)) {
  http_response_code(400);
  echo json_encode(['ok'=>false,'err'=>'invalid service']); exit;
}

if (!in_array($action,['start','stop','restart','status'])) {
  http_response_code(400);
  echo json_encode(['ok'=>false,'err'=>'invalid action']); exit;
}

$cmd = escapeshellcmd("/usr/local/bin/zftsctl {$action} {$service}");
exec($cmd." 2>&1", $out, $rc);

echo json_encode([
  'ok' => $rc === 0,
  'output' => implode("\n", $out),
  'err' => $rc !== 0 ? implode("\n", $out) : null
]);
?>
