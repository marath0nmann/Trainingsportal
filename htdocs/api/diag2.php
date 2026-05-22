<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', '0');
ob_start();

register_shutdown_function(function() {
    $e = error_get_last();
    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/json; charset=utf-8');
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        echo json_encode(['fatal' => $e['message'], 'file' => $e['file'], 'line' => $e['line']]);
    }
});

try {
    require_once __DIR__ . '/../../includes/auth.php';
    require_once __DIR__ . '/../../includes/db.php';
    require_once __DIR__ . '/../../includes/settings.php';
    Auth::startSession();
    $v = Settings::get('training_db_version');
    ob_end_clean();
    echo json_encode(['ok' => true, 'php' => PHP_VERSION, 'db_version' => $v, 'phase' => 'session+settings ok']);
} catch (Throwable $e) {
    ob_end_clean();
    echo json_encode(['ok' => false, 'error' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()]);
}
