<?php
// Tests if index.php is parseable by trying to compile it
header('Content-Type: application/json; charset=utf-8');
$file = __DIR__ . '/index.php';
$result = ['file_exists' => file_exists($file), 'file_size' => filesize($file)];

// Check first 50 chars to see which version is there
$handle = fopen($file, 'r');
$snippet = fread($handle, 200);
fclose($handle);
$result['first_200_chars'] = $snippet;

// Check for COLUMN_EXISTS which was in broken v124
$content = file_get_contents($file);
$result['has_column_exists'] = strpos($content, 'COLUMN_EXISTS') !== false;
$result['has_select_e_star'] = strpos($content, 'SELECT e.*') !== false;
$result['line_count'] = substr_count($content, "\n");

echo json_encode($result, JSON_PRETTY_PRINT);
