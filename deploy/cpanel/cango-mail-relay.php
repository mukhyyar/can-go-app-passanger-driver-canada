<?php
/**
 * Can Ride — HTTP mail relay for DigitalOcean NestJS
 * (DO blocks outbound SMTP; this host can send locally.)
 *
 * Upload with: cango-mail-relay.config.php (from the .example file)
 * URL: https://notify.can-rides.ca/cango-mail-relay.php
 *
 * POST JSON:
 *   { "to": "...", "subject": "...", "html": "...", "text": "...", "from": "optional" }
 * Header:
 *   X-Mail-Relay-Key: <relay_key>
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Allow: POST, OPTIONS');
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$configPath = __DIR__ . '/cango-mail-relay.config.php';
if (!is_readable($configPath)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Config missing']);
    exit;
}

/** @var array{relay_key:string,smtp_host:string,smtp_port:int,smtp_user:string,smtp_pass:string,from:string,allow_ips?:array} $config */
$config = require $configPath;

$clientIp = '';
if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
    $clientIp = (string) $_SERVER['HTTP_CF_CONNECTING_IP'];
} elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    $clientIp = (string) $_SERVER['HTTP_X_FORWARDED_FOR'];
} elseif (!empty($_SERVER['REMOTE_ADDR'])) {
    $clientIp = (string) $_SERVER['REMOTE_ADDR'];
}
if (strpos($clientIp, ',') !== false) {
    $clientIp = trim(explode(',', $clientIp)[0]);
}

$allowIps = $config['allow_ips'] ?? [];
if (is_array($allowIps) && count($allowIps) > 0) {
    if (!in_array($clientIp, $allowIps, true)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'IP not allowed']);
        exit;
    }
}

$providedKey = $_SERVER['HTTP_X_MAIL_RELAY_KEY'] ?? '';
$expectedKey = (string) ($config['relay_key'] ?? '');
if ($expectedKey === '' || $expectedKey === 'CHANGE_ME_TO_LONG_RANDOM_SECRET'
    || !hash_equals($expectedKey, (string) $providedKey)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$to = trim((string) ($data['to'] ?? ''));
$subject = trim((string) ($data['subject'] ?? ''));
$html = (string) ($data['html'] ?? '');
$text = (string) ($data['text'] ?? '');
$from = trim((string) ($data['from'] ?? $config['from'] ?? ''));

if ($to === '' || $subject === '' || ($html === '' && $text === '')) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'to, subject, and html/text are required']);
    exit;
}

if (!filter_var(extract_email($to), FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid to address']);
    exit;
}

if ($text === '' && $html !== '') {
    $text = trim(preg_replace('/\s+/', ' ', strip_tags($html)) ?? '');
}

try {
    $messageId = smtp_send([
        'host' => (string) $config['smtp_host'],
        'port' => (int) ($config['smtp_port'] ?? 465),
        'user' => (string) $config['smtp_user'],
        'pass' => (string) $config['smtp_pass'],
        'from' => $from,
        'to' => $to,
        'subject' => $subject,
        'html' => $html,
        'text' => $text,
    ]);
    echo json_encode(['ok' => true, 'id' => $messageId]);
} catch (Throwable $e) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'Send failed', 'detail' => $e->getMessage()]);
}

function extract_email(string $value): string
{
    if (preg_match('/<([^>]+)>/', $value, $m)) {
        return trim($m[1]);
    }
    return trim($value);
}

/**
 * @param array{host:string,port:int,user:string,pass:string,from:string,to:string,subject:string,html:string,text:string} $opts
 */
function smtp_send(array $opts): string
{
    $host = $opts['host'];
    $port = $opts['port'];
    $secure = ($port === 465);
    $remote = ($secure ? 'ssl://' : '') . $host;

    $fp = @stream_socket_client(
        $remote . ':' . $port,
        $errno,
        $errstr,
        20,
        STREAM_CLIENT_CONNECT
    );
    if (!$fp) {
        throw new RuntimeException("SMTP connect failed: $errstr ($errno)");
    }
    stream_set_timeout($fp, 20);

    smtp_expect($fp, [220]);
    $ehloHost = 'can-rides.ca';
    smtp_cmd($fp, "EHLO $ehloHost", [250]);

    if (!$secure && $port === 587) {
        smtp_cmd($fp, 'STARTTLS', [220]);
        if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new RuntimeException('STARTTLS failed');
        }
        smtp_cmd($fp, "EHLO $ehloHost", [250]);
    }

    smtp_cmd($fp, 'AUTH LOGIN', [334]);
    smtp_cmd($fp, base64_encode($opts['user']), [334]);
    smtp_cmd($fp, base64_encode($opts['pass']), [235]);

    $fromEmail = extract_email($opts['from']);
    $toEmail = extract_email($opts['to']);
    smtp_cmd($fp, 'MAIL FROM:<' . $fromEmail . '>', [250]);
    smtp_cmd($fp, 'RCPT TO:<' . $toEmail . '>', [250, 251]);
    smtp_cmd($fp, 'DATA', [354]);

    $boundary = 'b_' . bin2hex(random_bytes(8));
    $messageId = sprintf('<%s@can-rides.ca>', bin2hex(random_bytes(12)));
    $date = date('r');
    $subjectEncoded = '=?UTF-8?B?' . base64_encode($opts['subject']) . '?=';

    $headers = [
        'Date: ' . $date,
        'From: ' . $opts['from'],
        'To: ' . $opts['to'],
        'Subject: ' . $subjectEncoded,
        'Message-ID: ' . $messageId,
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
    ];

    $body = implode("\r\n", $headers) . "\r\n\r\n";
    $body .= '--' . $boundary . "\r\n";
    $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $body .= chunk_split(base64_encode($opts['text'])) . "\r\n";
    $body .= '--' . $boundary . "\r\n";
    $body .= "Content-Type: text/html; charset=UTF-8\r\n";
    $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $body .= chunk_split(base64_encode($opts['html'] !== '' ? $opts['html'] : nl2br(htmlspecialchars($opts['text'], ENT_QUOTES, 'UTF-8')))) . "\r\n";
    $body .= '--' . $boundary . "--\r\n";

    // Dot-stuff lines starting with .
    $body = preg_replace('/^\./m', '..', $body) ?? $body;
    fwrite($fp, $body . "\r\n.\r\n");
    smtp_expect($fp, [250]);
    smtp_cmd($fp, 'QUIT', [221]);
    fclose($fp);

    return $messageId;
}

/** @param resource $fp */
function smtp_cmd($fp, string $cmd, array $okCodes): void
{
    fwrite($fp, $cmd . "\r\n");
    smtp_expect($fp, $okCodes);
}

/** @param resource $fp @param list<int> $okCodes */
function smtp_expect($fp, array $okCodes): void
{
    $response = '';
    while (($line = fgets($fp, 515)) !== false) {
        $response .= $line;
        if (isset($line[3]) && $line[3] === ' ') {
            break;
        }
    }
    $code = (int) substr($response, 0, 3);
    if (!in_array($code, $okCodes, true)) {
        throw new RuntimeException('SMTP error: ' . trim($response));
    }
}
