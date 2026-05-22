<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', '0');

// Capture the output from running index.php
ob_start();
$error = null;

set_error_handler(function($errno, $errstr, $errfile, $errline) use (&$error) {
    $error = ['type' => 'warning', 'errno' => $errno, 'msg' => $errstr, 'line' => $errline];
    return false;
});

register_shutdown_function(function() {
    $e = error_get_last();
    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/json; charset=utf-8');
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR])) {
        echo json_encode(['shutdown_fatal' => $e]);
        exit;
    }
});

// Minimal stub to avoid session issues
$_GET['p'] = 'ping';
$_SERVER['REQUEST_METHOD'] = 'GET';

try {
    // Try to include index.php - this will actually run it
    // We use output buffering to capture what it outputs
    require_once __DIR__ . '/index.php';
    $output = ob_get_clean();
    echo json_encode(['wrapped_output' => $output, 'warning' => $error ?? null]);
} catch (Throwable $e) {
    ob_end_clean();
    echo json_encode([
        'exception' => $e->getMessage(),
        'class'     => get_class($e),
        'file'      => $e->getFile(),
        'line'      => $e->getLine(),
        'trace'     => array_slice($e->getTrace(), 0, 5),
    ]);
}
