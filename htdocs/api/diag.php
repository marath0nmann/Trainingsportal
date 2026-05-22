<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
$r = [];

// Test includes one by one
$includes = [
    'config'   => __DIR__ . '/../../includes/config.php',
    'db'       => __DIR__ . '/../../includes/db.php',
    'settings' => __DIR__ . '/../../includes/settings.php',
    'auth'     => __DIR__ . '/../../includes/auth.php',
];
foreach ($includes as $name => $path) {
    if (!file_exists($path)) {
        $r[$name] = 'MISSING: ' . $path;
    } else {
        try {
            require_once $path;
            $r[$name] = 'ok';
        } catch (Throwable $e) {
            $r[$name] = 'ERROR: ' . $e->getMessage();
        }
    }
}
$r['php'] = phpversion();
$r['dir'] = __DIR__;

// Test DB connection
try {
    $pdo = DB::get();
    $r['db_connect'] = 'ok';
} catch (Throwable $e) {
    $r['db_connect'] = 'ERROR: ' . $e->getMessage();
}

echo json_encode($r, JSON_PRETTY_PRINT);
