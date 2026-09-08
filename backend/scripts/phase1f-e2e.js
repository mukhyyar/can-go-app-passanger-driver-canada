/**
 * Phase 1f — primary marketplace E2E + security/chaos checks against a running API.
 *
 * Prerequisites: docker compose up, Nest on :4000, PostGIS zone SQL applied, MinIO up.
 *
 *   node scripts/phase1f-e2e.js
 *   npm run test:phase1f
 */
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const { randomUUID } = require('crypto');

const API = process.env.CANGO_API_BASE || 'http://127.0.0.1:4000/api';
const prisma = new PrismaClient();

const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
  'base64',
);

const results = [];
function ok(name, detail) {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, err) {
  results.push({ name, pass: false, detail: String(err) });
  console.error(`FAIL  ${name} — ${err}`);
}
async function check(name, fn) {
  try {
    const detail = await fn();
    ok(name, detail);
  } catch (e) {
    fail(name, e && e.stack ? e.message || e : e);
    throw e;
  }
}

async function api(path, { method = 'GET', token, body, headers = {}, form } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers: h, body: payload });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      data && data.message
        ? Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message
        : text || res.status;
    const err = new Error(`${method} ${path} → ${res.status}: ${msg}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function registerAndVerify(role, email, phone, password, fullName) {
  const reg = await api('/auth/register', {
    method: 'POST',
    body: { email, password, phoneE164: phone, role, fullName },
  });
  if (!reg.challengeId) throw new Error('missing challengeId');
  const code = reg.debugCode;
  if (!code) {
    throw new Error(
      'OTP debugCode missing — set NODE_ENV=local|development for Phase 1f',
    );
  }
  const session = await api('/auth/otp/verify', {
    method: 'POST',
    body: { challengeId: reg.challengeId, code: String(code) },
  });
  return session;
}

async function ensureAdmin() {
  const email = 'admin-e2e@can-go.local';
  const phone = '+15550009999';
  const password = 'password123';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      phoneE164: phone,
      phoneVerifiedAt: new Date(),
      role: 'ADMIN',
      isSuspended: false,
    },
    create: {
      email,
      phoneE164: phone,
      phoneVerifiedAt: new Date(),
      passwordHash,
      role: 'ADMIN',
    },
  });
  const login = await api('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  return login.accessToken;
}

async function uploadDoc(token, docType, vehicleId) {
  const form = new FormData();
  form.append('docType', docType);
  if (vehicleId) form.append('vehicleId', vehicleId);
  form.append('file', new Blob([JPEG], { type: 'image/jpeg' }), `${docType}.jpg`);
  return api('/driver/documents', { method: 'POST', token, form });
}

async function activateDriverFully(adminToken, driverToken, driverProfileId) {
  const vehicle = await api('/driver/vehicles', {
    method: 'POST',
    token: driverToken,
    body: { name: 'E2E Sedan', plate: `E2E${Date.now() % 100000}`, vehicleClass: 'sedan' },
  });
  for (const t of ['selfie', 'license', 'vehicle_registration']) {
    await uploadDoc(driverToken, t, t === 'vehicle_registration' ? vehicle.id : undefined);
  }
  await uploadDoc(driverToken, 'vehicle_photo', vehicle.id);

  const kyc = await api(`/admin/drivers/${driverProfileId}/kyc`, { token: adminToken });
  for (const doc of kyc.documents || []) {
    if (doc.status !== 'APPROVED') {
      await api(`/admin/documents/${doc.id}/review`, {
        method: 'POST',
        token: adminToken,
        body: { status: 'APPROVED' },
      });
    }
  }
  await api(`/admin/drivers/${driverProfileId}/activate`, {
    method: 'POST',
    token: adminToken,
    body: {},
  });

  // Zone covering YYZ / GTA sample points used below
  await api('/driver/operating-zones', {
    method: 'POST',
    token: driverToken,
    body: {
      name: 'E2E GTA',
      zoneType: 'circle',
      geoJson: { center: [-79.5, 43.7], radiusKm: 80 },
      radiusKm: 80,
    },
  });
  return vehicle.id;
}

async function createBookedTrip(passengerToken, driverToken) {
  const pickupAt = new Date(Date.now() + 3600_000).toISOString();
  const ride = await api('/rides', {
    method: 'POST',
    token: passengerToken,
    headers: { 'Idempotency-Key': `e2e-ride-${randomUUID()}` },
    body: {
      serviceType: 'RIDE',
      fromLabel: 'YYZ Terminal 1',
      toLabel: 'Downtown Toronto',
      fromLat: 43.6777,
      fromLng: -79.6248,
      toLat: 43.6426,
      toLng: -79.3871,
      pickupAt,
      vehicleClassIds: ['sedan'],
      adults: 2,
    },
  });

  const open = await api('/driver/requests', { token: driverToken });
  const list = Array.isArray(open) ? open : open._list || [];
  if (!list.some((r) => r.id === ride.id)) {
    throw new Error(`Driver did not see ride ${ride.id} in zone match (${list.length} open)`);
  }

  const quoteHint = ride.priceSnapshot || {};
  const bid =
    typeof quoteHint.guidanceAmount === 'number'
      ? quoteHint.guidanceAmount
      : 40;
  const offer = await api(`/rides/${ride.id}/offers`, {
    method: 'POST',
    token: driverToken,
    body: { bidAmount: bid },
  });

  await api(`/rides/${ride.id}/select-offer`, {
    method: 'POST',
    token: passengerToken,
    body: { offerId: offer.id },
  });

  const pay = await api('/payments/intents', {
    method: 'POST',
    token: passengerToken,
    body: { rideId: ride.id },
  });
  if (pay.ride?.status !== 'BOOKED') {
    throw new Error(`Expected BOOKED after pay, got ${pay.ride?.status}`);
  }
  return { rideId: ride.id, offer, payment: pay.payment, snap: offer.priceSnapshot };
}

async function runTripLifecycle(driverToken, passengerToken, rideId) {
  await api(`/driver/rides/${rideId}/en-route`, { method: 'POST', token: driverToken, body: {} });
  await api(`/driver/rides/${rideId}/arrived`, { method: 'POST', token: driverToken, body: {} });
  await api(`/driver/rides/${rideId}/start`, { method: 'POST', token: driverToken, body: {} });
  await api('/tracking/location', {
    method: 'POST',
    token: driverToken,
    body: { lat: 43.65, lng: -79.4, rideId },
  });
  await api('/tracking/location', {
    method: 'POST',
    token: driverToken,
    body: { lat: 43.645, lng: -79.39, rideId },
  });
  const done = await api(`/driver/rides/${rideId}/complete`, {
    method: 'POST',
    token: driverToken,
    body: {},
  });
  if (done.status !== 'COMPLETED') throw new Error(`Expected COMPLETED, got ${done.status}`);

  await api(`/rides/${rideId}/ratings`, {
    method: 'POST',
    token: passengerToken,
    body: { stars: 5, comment: 'Great E2E trip' },
  });
  await api(`/rides/${rideId}/ratings`, {
    method: 'POST',
    token: driverToken,
    body: { stars: 5, comment: 'Punctual passenger' },
  });
  const ratings = await api(`/rides/${rideId}/ratings`, { token: passengerToken });
  const count = Array.isArray(ratings) ? ratings.length : (ratings.ratings || []).length;
  if (count < 2) throw new Error(`Expected 2 ratings, got ${count}`);
  return done;
}

async function main() {
  console.log(`Phase 1f E2E → ${API}\n`);

  await check('health', async () => {
    const h = await api('/health');
    if (h.status !== 'ok' && h.status !== 'error') {
      // terminus may nest
    }
    return JSON.stringify(h.status || h);
  });

  const stamp = Date.now();
  const passEmail = `pax.e2e.${stamp}@can-go.local`;
  const drvEmail = `drv.e2e.${stamp}@can-go.local`;
  const passPhone = `+15551${String(stamp).slice(-7)}`;
  const drvPhone = `+15552${String(stamp).slice(-7)}`;

  let adminToken;
  let passenger;
  let driver;
  let driverProfileId;
  let booked;

  await check('seed admin + login', async () => {
    adminToken = await ensureAdmin();
    return 'ok';
  });

  await check('passenger register + OTP', async () => {
    passenger = await registerAndVerify(
      'PASSENGER',
      passEmail,
      passPhone,
      'password123',
      'E2E Passenger',
    );
    return passenger.user?.id || 'token';
  });

  await check('driver register + OTP', async () => {
    driver = await registerAndVerify(
      'DRIVER',
      drvEmail,
      drvPhone,
      'password123',
      'E2E Driver',
    );
    const me = await api('/auth/me', { token: driver.accessToken });
    driverProfileId = me.driver?.id;
    if (!driverProfileId) throw new Error('driver profile id missing on /me');
    return driverProfileId;
  });

  await check('KYC upload + admin approve + activate + zone', async () => {
    await activateDriverFully(adminToken, driver.accessToken, driverProfileId);
    const me = await api('/auth/me', { token: driver.accessToken });
    if (!me.driver?.isActivated) throw new Error('driver not activated');
    return me.driver.approvalStatus;
  });

  await check('primary: book → offer → pay → BOOKED', async () => {
    booked = await createBookedTrip(passenger.accessToken, driver.accessToken);
    const earning = booked.snap?.driverEarning;
    if (earning == null) throw new Error('driverEarning missing on offer snapshot');
    return `ride=${booked.rideId} earning=${earning}`;
  });

  await check('primary: trip lifecycle + tracking + ratings', async () => {
    const ride = await runTripLifecycle(
      driver.accessToken,
      passenger.accessToken,
      booked.rideId,
    );
    return ride.status;
  });

  await check('earning receipt on completed ride', async () => {
    const ride = await api(`/rides/${booked.rideId}`, { token: passenger.accessToken });
    const snap =
      ride.selectedOffer?.priceSnapshot ||
      ride.priceSnapshot ||
      booked.snap;
    if (snap.driverEarning == null || snap.passengerTotal == null) {
      throw new Error('missing earning/total on completed ride');
    }
    return `driverEarning=${snap.driverEarning} passengerTotal=${snap.passengerTotal}`;
  });

  // --- Security / chaos ---

  await check('IDOR: other passenger cannot read ride', async () => {
    const other = await registerAndVerify(
      'PASSENGER',
      `pax2.e2e.${stamp}@can-go.local`,
      `+15553${String(stamp).slice(-7)}`,
      'password123',
      'E2E Other',
    );
    try {
      await api(`/rides/${booked.rideId}`, { token: other.accessToken });
      throw new Error('expected forbidden/not found');
    } catch (e) {
      if (e.status === 403 || e.status === 404) return String(e.status);
      throw e;
    }
  });

  await check('idempotent ride create', async () => {
    const key = `idem-${stamp}`;
    const pickupAt = new Date(Date.now() + 7200_000).toISOString();
    const body = {
      serviceType: 'RIDE',
      fromLabel: 'Idem A',
      toLabel: 'Idem B',
      fromLat: 43.6777,
      fromLng: -79.6248,
      toLat: 43.65,
      toLng: -79.4,
      pickupAt,
      vehicleClassIds: ['sedan'],
      adults: 1,
    };
    const a = await api('/rides', {
      method: 'POST',
      token: passenger.accessToken,
      headers: { 'Idempotency-Key': key },
      body,
    });
    const b = await api('/rides', {
      method: 'POST',
      token: passenger.accessToken,
      headers: { 'Idempotency-Key': key },
      body,
    });
    if (a.id !== b.id) throw new Error(`idem mismatch ${a.id} vs ${b.id}`);
    return a.id;
  });

  await check('passenger cancel before payment', async () => {
    const pickupAt = new Date(Date.now() + 9000_000).toISOString();
    const ride = await api('/rides', {
      method: 'POST',
      token: passenger.accessToken,
      body: {
        serviceType: 'RIDE',
        fromLabel: 'Cancel From',
        toLabel: 'Cancel To',
        fromLat: 43.6777,
        fromLng: -79.6248,
        toLat: 43.65,
        toLng: -79.4,
        pickupAt,
        vehicleClassIds: ['sedan'],
        adults: 1,
      },
    });
    const cancelled = await api(`/rides/${ride.id}/cancel`, {
      method: 'POST',
      token: passenger.accessToken,
      body: {},
    });
    if (cancelled.status !== 'PASSENGER_CANCELLED') {
      throw new Error(`got ${cancelled.status}`);
    }
    return cancelled.status;
  });

  await check('no-show after arrived', async () => {
    const trip = await createBookedTrip(passenger.accessToken, driver.accessToken);
    await api(`/driver/rides/${trip.rideId}/en-route`, {
      method: 'POST',
      token: driver.accessToken,
      body: {},
    });
    await api(`/driver/rides/${trip.rideId}/arrived`, {
      method: 'POST',
      token: driver.accessToken,
      body: {},
    });
    const ns = await api(`/driver/rides/${trip.rideId}/no-show`, {
      method: 'POST',
      token: driver.accessToken,
      body: {},
    });
    if (ns.status !== 'NO_SHOW') throw new Error(`got ${ns.status}`);
    return ns.status;
  });

  await check('duplicate payment webhook is idempotent', async () => {
    const trip = await createBookedTrip(passenger.accessToken, driver.accessToken);
    // Create a synthetic pending payment path is hard after Dev auto-succeeds.
    // Post webhook twice for the existing payment providerRef — second must be duplicate.
    const body = JSON.stringify({
      eventId: `e2e-wh-${trip.payment.id}`,
      paymentRef: trip.payment.providerRef,
      status: 'succeeded',
      type: 'payment.succeeded',
    });
    const first = await api('/payments/webhooks/dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.parse(body),
    });
    const second = await api('/payments/webhooks/dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.parse(body),
    });
    if (!second.duplicate && second.ok !== true) {
      // first may not set duplicate; second must
    }
    if (!second.duplicate) {
      throw new Error(`expected duplicate on second webhook: ${JSON.stringify(second)}`);
    }
    return `first=${JSON.stringify(first)} second.duplicate=${second.duplicate}`;
  });

  await check('admin boundary: driver cannot hit KYC queue', async () => {
    try {
      await api('/admin/drivers/kyc', { token: driver.accessToken });
      throw new Error('expected 403');
    } catch (e) {
      if (e.status === 403 || e.status === 401) return String(e.status);
      throw e;
    }
  });

  const failed = results.filter((r) => !r.pass);
  console.log('\n---');
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error('\nAborted:', e.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
