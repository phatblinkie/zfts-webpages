<?php
header('Content-Type: application/json');

// directory that actually holds your .ini files
$base = '/usr/share/nginx/html/zfts/zfts-admin/config/zfts.configs';

// Sanitize input
$file = isset($_GET['file']) ? basename($_GET['file']) : null;

if ($file) {
    $path = "$base/$file";
    if (!file_exists($path)) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'err' => "File not found: $path"]);
        exit;
    }

    // Just return raw text (since parse_ini_file fails on JSON sections)
    $text = file_get_contents($path);
    echo json_encode(['ok' => true, 'raw' => $text]);
    exit;
}

/* ---------- list mode ---------- */
$files = glob("$base/*.ini") ?: [];
$names = array_map('basename', $files);
echo json_encode(['ok' => true, 'files' => $names]);
?>
