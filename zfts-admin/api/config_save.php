<?php
require_once __DIR__ . '/session.php';      // ✅ start session first
require_once __DIR__ . '/require_auth.php';
require_once __DIR__ . '/csrf_check.php';

header('Content-Type: application/json');

$base = '/usr/share/nginx/html/zfts/zfts-admin/config/zfts.configs';

// Expect simple form-encoded POST (file + content)
$file = isset($_POST['file']) ? basename($_POST['file']) : null;
$content = isset($_POST['content']) ? $_POST['content'] : null;

if (!$file || $content === null) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'err'=>'missing parameters']);
    exit;
}

$path = "$base/$file";
if (!file_exists($path)) {
    http_response_code(404);
    echo json_encode(['ok'=>false,'err'=>"file not found: $path"]);
    exit;
}

if (!is_writable($path)) {
    echo json_encode(['ok'=>false,'err'=>"permission denied: $path"]);
    exit;
}

$result = file_put_contents($path, $content);
echo json_encode(['ok'=> $result !== false, 'err'=> $result === false ? 'write failed' : null]);
?>
