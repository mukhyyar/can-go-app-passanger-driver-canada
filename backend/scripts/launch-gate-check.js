/**
 * CI / pre-deploy launch-gate check.
 *
 * Usage:
 *   node scripts/launch-gate-check.js              # against running API
 *   node scripts/launch-gate-check.js --require-ready
 *   STAGING_E2E_PASSED=true npm run launch-gate:check -- --require-ready
 */
const API = process.env.CANGO_API_BASE || 'http://127.0.0.1:4000/api';
const requireReady = process.argv.includes('--require-ready');
const requireProdBoot = process.argv.includes('--require-prod-boot');

async function main() {
  const res = await fetch(`${API}/providers/status`);
  if (!res.ok) {
    throw new Error(`GET /providers/status → ${res.status}`);
  }
  const status = await res.json();
  console.log(JSON.stringify(status, null, 2));

  const blockers = status.blockedReasons || [];
  if (blockers.length) {
    console.log('\nBlocked reasons:');
    for (const b of blockers) console.log(` - ${b}`);
  }

  if (requireReady && !status.productionReady) {
    throw new Error('productionReady=false (real Payment/Payout/SMS/OTP required)');
  }
  if (requireProdBoot && !status.canBootProduction) {
    throw new Error(
      'canBootProduction=false — set real providers, credentials, STAGING_E2E_PASSED=true, ADMIN_TOTP_ENFORCE=true',
    );
  }

  console.log(
    `\nSummary: productionReady=${status.productionReady} stagingE2ePassed=${status.stagingE2ePassed} canBootProduction=${status.canBootProduction}`,
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
