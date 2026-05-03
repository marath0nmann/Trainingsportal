<?php
// Einmalig aufrufen nach Deploy um OPcache zu leeren
// Danach bitte löschen (oder via .htaccess schützen)
if (function_exists('opcache_reset')) {
    opcache_reset();
    echo 'OPcache geleert.';
} else {
    echo 'OPcache nicht aktiv.';
}
