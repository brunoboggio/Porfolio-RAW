<?php
// Proxy script for Yahoo Finance & FRED API
// Handles v8, v1, and FRED API requests

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// ── FRED API Key ──────────────────────────────────────────────────
// Get your FREE key at: https://fred.stlouisfed.org/docs/api/api_key.html
// Replace the placeholder below with your actual key.
$FRED_API_KEY = 'YOUR_FRED_API_KEY_HERE';

$request_uri = $_SERVER['REQUEST_URI'];
$base_v8 = '/api/yahoo/v8/';
$base_v1 = '/api/yahoo/v1/';
$base_fred = '/api/fred/';

$target_url = '';

if (strpos($request_uri, $base_v8) !== false) {
    // Yahoo Finance v8 (Chart)
    $path = substr($request_uri, strpos($request_uri, $base_v8) + strlen($base_v8));
    $target_url = 'https://query1.finance.yahoo.com/v8/' . $path;
} elseif (strpos($request_uri, $base_v1) !== false) {
    // Yahoo Finance v1 (Search)
    $path = substr($request_uri, strpos($request_uri, $base_v1) + strlen($base_v1));
    $target_url = 'https://query1.finance.yahoo.com/v1/' . $path;
} elseif (strpos($request_uri, $base_fred) !== false) {
    // FRED API (Federal Reserve Economic Data)
    $path = substr($request_uri, strpos($request_uri, $base_fred) + strlen($base_fred));
    // Append API key
    $separator = (strpos($path, '?') !== false) ? '&' : '?';
    $target_url = 'https://api.stlouisfed.org/fred/' . $path . $separator . 'api_key=' . $FRED_API_KEY;
} else {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid API path']);
    exit;
}

// Initialize cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $target_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    http_response_code(500);
    echo json_encode(['error' => 'Curl error: ' . curl_error($ch)]);
} else {
    http_response_code($http_code);
    echo $response;
}

curl_close($ch);
?>
