/**
 * List Stripe webhook endpoints (no secrets printed beyond whsec prefix).
 * Usage: node scripts/check-stripe-webhooks.mjs
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const secret = process.env.STRIPE_SECRET_KEY;
const localWhsec = process.env.STRIPE_WEBHOOK_SECRET || '';

if (!secret) {
  console.error('STRIPE_SECRET_KEY missing');
  process.exit(1);
}

const res = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=20', {
  headers: { Authorization: `Bearer ${secret}` },
});
const data = await res.json();
if (!res.ok) {
  console.error(JSON.stringify(data));
  process.exit(1);
}

const expected = 'https://www.can-rides.ca/api/payments/webhooks/stripe';
const endpoints = (data.data || []).map((e) => ({
  id: e.id,
  url: e.url,
  status: e.status,
  enabled_events: e.enabled_events,
  api_version: e.api_version,
  livemode: e.livemode,
  matchesExpected: e.url === expected || e.url === expected.replace('www.', ''),
}));

const hasPaymentSucceeded = endpoints.some(
  (e) =>
    e.matchesExpected &&
    e.status === 'enabled' &&
    (e.enabled_events.includes('*') ||
      e.enabled_events.includes('payment_intent.succeeded')),
);

console.log(
  JSON.stringify(
    {
      keyMode: secret.startsWith('sk_live')
        ? 'live'
        : secret.startsWith('sk_test')
          ? 'test'
          : 'unknown',
      localWebhookSecretSet: Boolean(localWhsec),
      localWebhookSecretPrefix: localWhsec.slice(0, 6),
      expectedUrl: expected,
      hasPaymentSucceededEndpoint: hasPaymentSucceeded,
      endpoints,
    },
    null,
    2,
  ),
);
