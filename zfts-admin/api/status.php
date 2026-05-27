<?php
header('Content-Type: application/json');

$tails = ['dops-p2','105','107'];
$result = [];

foreach ($tails as $t) {
  foreach (['zfts','zcompd'] as $svc) {
    $name = "$svc-$t";
    $cmd  = "systemctl is-active " . escapeshellarg($name) . " 2>/dev/null";
    $out  = trim(shell_exec($cmd));
    $result[$name] = $out ?: 'unknown';
  }
}

echo json_encode(['ok' => true, 'status' => $result]);
?>
