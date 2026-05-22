<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

// Capture any output and errors from loading index.php
ini_set('display_errors', '0');
ob_start();

$parseError = null;
$runtimeError = null;

// Register shutdown to catch fatals
register_shutdown_function(function() use (&$parseError) {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR])) {
        // Clear previous output
        while (ob_get_level() > 0) ob_end_clean();
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'phase' => 'fatal',
            'type'  => $e['type'],
            'msg'   => $e['message'],
            'file'  => $e['file'],
            'line'  => $e['line'],
        ]);
    }
});

// Simulate what index.php does at the top level
try {
    require_once __DIR__ . '/../../includes/auth.php';
    require_once __DIR__ . '/../../includes/db.php';
    require_once __DIR__ . '/../../includes/settings.php';
    $runtimeError = 'includes ok';
    
    // Test Auth::startSession
    Auth::startSession();
    $runtimeError = 'session ok';
    
    // Test runPendingMigrations equivalent
    $version = (int)(Settings::get('training_db_version') ?? 0);
    $runtimeError = 'settings ok, db_version=' . $version;
    
} catch (Throwable $e) {
    $runtimeError = 'CAUGHT: ' . $e->getMessage() . ' at ' . $e->getFile() . ':' . $e->getLine();
}

ob_end_clean();
echo json_encode(['phase' => 'runtime', 'result' => $runtimeError, 'php' => PHP_VERSION]);
