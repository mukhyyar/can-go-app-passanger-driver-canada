/**
 * Seed realistic KYC enterprise cases for local testing.
 * Usage: node scripts/seed-kyc-enterprise.js
 * Requires DATABASE_URL and working Prisma client.
 */
/* eslint-disable no-console */
const { PrismaClient, DocumentLifecycleStatus, DocumentReviewStatus, DriverApprovalStatus, UserRole, KycFlagType } = require('@prisma/client');
const { createHash, randomBytes } = require('crypto');
const argon2 = require('argon2');

const prisma = new PrismaClient();

function hash(s) {
  return createHash('sha256').update(s).digest('hex');
}

function key(driverId, docType, v) {
  return `drivers/${driverId}/${docType}/seed-v${v}-${randomBytes(4).toString('hex')}.jpg`;
}

async function upsertDriver(email, phone, fullName, status, activated) {
  const passwordHash = await argon2.hash('Driver123!', { type: argon2.argon2id });
  const user = await prisma.user.upsert({
    where: { email },
    update: { phoneE164: phone, isSuspended: false, passwordHash },
    create: {
      email,
      phoneE164: phone,
      passwordHash,
      role: UserRole.DRIVER,
    },
  });
  const profile = await prisma.driverProfile.upsert({
    where: { userId: user.id },
    update: {
      fullName,
      legalName: fullName,
      approvalStatus: status,
      isActivated: activated,
      kycSubmittedAt: new Date(Date.now() - 3600_000),
      baseLocation: 'Toronto, ON',
      city: 'Toronto',
      province: 'ON',
      country: 'CA',
      licenceNumber: `ON-${randomBytes(3).toString('hex').toUpperCase()}`,
      licenceJurisdiction: 'ON',
    },
    create: {
      userId: user.id,
      fullName,
      legalName: fullName,
      approvalStatus: status,
      isActivated: activated,
      kycSubmittedAt: new Date(Date.now() - 3600_000),
      baseLocation: 'Toronto, ON',
      city: 'Toronto',
      province: 'ON',
      country: 'CA',
      licenceNumber: `ON-${randomBytes(3).toString('hex').toUpperCase()}`,
      licenceJurisdiction: 'ON',
    },
  });
  await prisma.driverDocument.deleteMany({ where: { driverId: profile.id } });
  await prisma.kycFlag.deleteMany({ where: { driverId: profile.id } });
  await prisma.vehicle.deleteMany({ where: { driverId: profile.id } });
  const vehicle = await prisma.vehicle.create({
    data: {
      driverId: profile.id,
      name: `${fullName.split(' ')[0]}'s Sedan`,
      plate: `CG${randomBytes(2).toString('hex').toUpperCase()}`,
      vehicleClass: 'SEDAN',
    },
  });
  return { user, profile, vehicle };
}

async function addDoc(driverId, docType, opts) {
  const id = undefined;
  const versionNumber = opts.versionNumber ?? 1;
  const lifecycleStatus = opts.lifecycleStatus ?? DocumentLifecycleStatus.CURRENT;
  const status = opts.status ?? DocumentReviewStatus.PENDING;
  const storageKey = key(driverId, docType, versionNumber);
  const doc = await prisma.driverDocument.create({
    data: {
      driverId,
      vehicleId: opts.vehicleId,
      documentGroupId: opts.documentGroupId ?? 'pending',
      docType,
      versionNumber,
      lifecycleStatus,
      previousVersionId: opts.previousVersionId,
      storageKey,
      originalFilename: opts.originalFilename ?? `${docType}-v${versionNumber}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 120000 + versionNumber * 1000,
      checksumSha256: hash(storageKey),
      status,
      rejectionReason: opts.rejectionReason,
      expiresAt: opts.expiresAt,
      uploadSource: opts.uploadSource ?? 'DRIVER_APP',
      sourceReference: opts.sourceReference,
      adminNote: opts.adminNote,
      uploadedByType: opts.uploadedByType ?? 'DRIVER',
      uploadedById: opts.uploadedById,
      documentNumber: opts.documentNumber,
      issueDate: opts.issueDate,
      issuingJurisdiction: opts.issuingJurisdiction ?? 'ON',
    },
  });
  if (!opts.documentGroupId) {
    await prisma.driverDocument.update({
      where: { id: doc.id },
      data: { documentGroupId: doc.id },
    });
    doc.documentGroupId = doc.id;
  }
  return doc;
}

async function main() {
  console.log('Seeding KYC enterprise cases…');

  // CASE A: 4 docs all pending
  {
    const { profile, vehicle } = await upsertDriver(
      'kyc-case-a@can-go.test',
      '+14165550101',
      'Alice Pending',
      DriverApprovalStatus.PENDING_KYC,
      false,
    );
    for (const t of ['selfie', 'license', 'vehicle_registration', 'vehicle_photo']) {
      await addDoc(profile.id, t, {
        status: DocumentReviewStatus.PENDING,
        vehicleId: t.startsWith('vehicle') ? vehicle.id : undefined,
        expiresAt: t === 'license' ? new Date('2027-12-18') : undefined,
      });
    }
    console.log('CASE A', profile.id, 'Alice Pending — 4 pending');
  }

  // CASE B: licence V1 rejected, V2 approved; others approved
  {
    const { profile, vehicle } = await upsertDriver(
      'kyc-case-b@can-go.test',
      '+14165550102',
      'Bob Versions',
      DriverApprovalStatus.IN_REVIEW,
      false,
    );
    const v1 = await addDoc(profile.id, 'license', {
      versionNumber: 1,
      lifecycleStatus: DocumentLifecycleStatus.SUPERSEDED,
      status: DocumentReviewStatus.REJECTED,
      rejectionReason: 'Image unclear',
    });
    await addDoc(profile.id, 'license', {
      versionNumber: 2,
      lifecycleStatus: DocumentLifecycleStatus.CURRENT,
      status: DocumentReviewStatus.APPROVED,
      documentGroupId: v1.documentGroupId,
      previousVersionId: v1.id,
      expiresAt: new Date('2028-06-01'),
    });
    for (const t of ['selfie', 'vehicle_registration', 'vehicle_photo']) {
      await addDoc(profile.id, t, {
        status: DocumentReviewStatus.APPROVED,
        vehicleId: t.startsWith('vehicle') ? vehicle.id : undefined,
      });
    }
    console.log('CASE B', profile.id, 'Bob Versions — licence V1/V2');
  }

  // CASE C: admin uploaded licence from EMAIL, previous driver upload preserved
  {
    const { profile, vehicle, user } = await upsertDriver(
      'kyc-case-c@can-go.test',
      '+14165550103',
      'Carol Email Upload',
      DriverApprovalStatus.IN_REVIEW,
      false,
    );
    const v1 = await addDoc(profile.id, 'license', {
      versionNumber: 1,
      lifecycleStatus: DocumentLifecycleStatus.SUPERSEDED,
      status: DocumentReviewStatus.REJECTED,
      rejectionReason: 'Front side incomplete',
      uploadSource: 'DRIVER_APP',
    });
    const v2 = await addDoc(profile.id, 'license', {
      versionNumber: 2,
      lifecycleStatus: DocumentLifecycleStatus.SUPERSEDED,
      status: DocumentReviewStatus.REJECTED,
      rejectionReason: 'Image unclear',
      documentGroupId: v1.documentGroupId,
      previousVersionId: v1.id,
      uploadSource: 'DRIVER_APP',
    });
    await addDoc(profile.id, 'license', {
      versionNumber: 3,
      lifecycleStatus: DocumentLifecycleStatus.CURRENT,
      status: DocumentReviewStatus.PENDING,
      documentGroupId: v1.documentGroupId,
      previousVersionId: v2.id,
      uploadSource: 'EMAIL',
      sourceReference: 'Email received 08 Sep 2026',
      adminNote:
        'Customer unable to upload from Driver App. Document received through support email.',
      uploadedByType: 'ADMIN',
      originalFilename: 'licence-scan-email.pdf',
      expiresAt: new Date('2027-10-10'),
    });
    for (const t of ['selfie', 'vehicle_registration', 'vehicle_photo']) {
      await addDoc(profile.id, t, {
        status: DocumentReviewStatus.APPROVED,
        vehicleId: t.startsWith('vehicle') ? vehicle.id : undefined,
      });
    }
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'KYC_DOCUMENT_VERSION_CREATED',
        resource: 'DriverDocument',
        resourceId: v2.id,
        reason: 'Admin email upload',
        meta: { uploadSource: 'EMAIL', versionNumber: 3 },
      },
    });
    console.log('CASE C', profile.id, 'Carol Email Upload — V1/V2/V3 EMAIL');
  }

  // CASE D: expired insurance + pending others
  {
    const { profile, vehicle } = await upsertDriver(
      'kyc-case-d@can-go.test',
      '+14165550104',
      'Dan Expired',
      DriverApprovalStatus.ACTION_REQUIRED,
      false,
    );
    for (const t of ['selfie', 'license', 'vehicle_registration', 'vehicle_photo']) {
      await addDoc(profile.id, t, {
        status: DocumentReviewStatus.APPROVED,
        vehicleId: t.startsWith('vehicle') ? vehicle.id : undefined,
        expiresAt: t === 'license' ? new Date('2028-01-01') : undefined,
      });
    }
    await addDoc(profile.id, 'insurance', {
      status: DocumentReviewStatus.APPROVED,
      expiresAt: new Date(Date.now() - 5 * 86400000),
      uploadSource: 'DRIVER_APP',
    });
    console.log('CASE D', profile.id, 'Dan Expired — expired insurance');
  }

  // CASE E: KYC approved, driver inactive
  {
    const { profile, vehicle } = await upsertDriver(
      'kyc-case-e@can-go.test',
      '+14165550105',
      'Eve Approved Inactive',
      DriverApprovalStatus.APPROVED,
      false,
    );
    for (const t of ['selfie', 'license', 'vehicle_registration', 'vehicle_photo']) {
      await addDoc(profile.id, t, {
        status: DocumentReviewStatus.APPROVED,
        vehicleId: t.startsWith('vehicle') ? vehicle.id : undefined,
        expiresAt: t === 'license' ? new Date('2028-01-01') : undefined,
      });
    }
    await prisma.driverProfile.update({
      where: { id: profile.id },
      data: { kycDecidedAt: new Date(), kycDecisionNote: 'All docs verified' },
    });
    console.log('CASE E', profile.id, 'Eve Approved Inactive');
  }

  // CASE F: KYC approved via manual override
  {
    const { profile, vehicle } = await upsertDriver(
      'kyc-case-f@can-go.test',
      '+14165550106',
      'Frank Override',
      DriverApprovalStatus.APPROVED,
      true,
    );
    await addDoc(profile.id, 'selfie', { status: DocumentReviewStatus.APPROVED });
    await addDoc(profile.id, 'license', {
      status: DocumentReviewStatus.PENDING,
      expiresAt: new Date('2027-01-01'),
    });
    await addDoc(profile.id, 'vehicle_registration', {
      status: DocumentReviewStatus.APPROVED,
      vehicleId: vehicle.id,
    });
    await addDoc(profile.id, 'vehicle_photo', {
      status: DocumentReviewStatus.NEEDS_RESUBMISSION,
      vehicleId: vehicle.id,
      rejectionReason: 'Plate not visible',
    });
    await prisma.driverProfile.update({
      where: { id: profile.id },
      data: {
        kycOverrideUsed: true,
        kycOverrideReason: 'VIP support escalation — temporary activation',
        kycOverrideAt: new Date(),
        kycDecidedAt: new Date(),
        isActivated: true,
      },
    });
    await prisma.kycFlag.create({
      data: {
        driverId: profile.id,
        flagType: KycFlagType.MANUAL_REVIEW,
        reason: 'Approved via override with incomplete docs',
        createdById: profile.userId,
      },
    });
    await prisma.auditLog.create({
      data: {
        action: 'KYC_OVERRIDE_USED',
        resource: 'DriverProfile',
        resourceId: profile.id,
        reason: 'VIP support escalation — temporary activation',
        meta: { kind: 'kyc_approve_override' },
        before: { approvalStatus: 'IN_REVIEW' },
        after: { approvalStatus: 'APPROVED', override: true },
      },
    });
    console.log('CASE F', profile.id, 'Frank Override — MANUAL OVERRIDE');
  }

  console.log('Done. Password for all seed drivers: Driver123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
