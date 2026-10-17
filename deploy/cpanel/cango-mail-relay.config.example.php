<?php
/**
 * Copy to: cango-mail-relay.config.php  (same folder as the relay script)
 * Do NOT commit the real config file — it holds secrets.
 */
return [
    // Must match EMAIL_RELAY_KEY on the DigitalOcean NestJS .env
    'relay_key' => 'CHANGE_ME_TO_LONG_RANDOM_SECRET',

    // cPanel mailbox SMTP (prefer mail hostname if localhost:465 fails)
    'smtp_host' => 'mail.can-rides.ca',
    'smtp_port' => 465,
    'smtp_user' => 'no-reply@can-rides.ca',
    'smtp_pass' => 'YOUR_MAILBOX_PASSWORD',

    // Default From (override allowed in JSON body "from")
    'from' => 'Can Ride <no-reply@can-rides.ca>',

    // Optional: only allow these NestJS server IPs (empty = any with valid key)
    // DigitalOcean droplet: 165.227.45.3
    'allow_ips' => ['165.227.45.3'],
];
