<?php
header('Content-Type: application/json');
$service = preg_replace('/[^a-z0-9_\-]/i','', $_POST['service'] ?? 'zfts');
$servicename = $_GET['service'];

// Build safe command
$cmd = "/usr/local/bin/zftsctl logs $servicename";
// echo $cmd;
exec($cmd . " 2>&1", $out, $rc);

// JSON for the JS poller in app.js
echo json_encode([
  'ok'     => $rc===0,
  'cursor' => null,
  'lines'  => $out,
  'rc'     => $rc
]);
