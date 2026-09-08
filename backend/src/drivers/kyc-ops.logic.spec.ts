import {
  averageMs,
  buildEligibility,
  buildVerificationChecks,
  canApproveKyc,
  docIndicator,
  driverShortId,
  expiryBand,
  formatDuration,
  kycStatusLabel,
  percentChange,
  pickLatestByType,
  progressFromDocs,
  tabForApprovalStatus,
  waitingSla,
} from './kyc-ops.logic';
import { KYC_SLA_BREACH_MS, KYC_SLA_WARN_MS } from './documents.constants';

describe('kyc-ops.logic', () => {
  it('maps approval statuses to reviewer-facing labels', () => {
    expect(kycStatusLabel('PENDING_KYC')).toBe('Pending Review');
    expect(kycStatusLabel('IN_REVIEW')).toBe('In Review');
    expect(kycStatusLabel('ACTION_REQUIRED')).toBe('Action Required');
    expect(kycStatusLabel('APPROVED')).toBe('Approved');
  });

  it('maps queue tabs from status', () => {
    expect(tabForApprovalStatus('PENDING_KYC')).toBe('awaiting');
    expect(tabForApprovalStatus('IN_REVIEW')).toBe('in_review');
    expect(tabForApprovalStatus('ACTION_REQUIRED')).toBe('action_required');
  });

  it('computes document progress from latest docs', () => {
    const progress = progressFromDocs([
      { docType: 'selfie', status: 'APPROVED' },
      { docType: 'license', status: 'PENDING' },
      { docType: 'vehicle_registration', status: 'APPROVED' },
      { docType: 'vehicle_photo', status: 'APPROVED' },
    ]);
    expect(progress.approved).toBe(3);
    expect(progress.required).toBe(4);
    expect(progress.percent).toBe(75);
    expect(progress.readyForKycApproval).toBe(false);
  });

  it('ignores SUPERSEDED docs when computing progress', () => {
    const progress = progressFromDocs([
      {
        docType: 'selfie',
        status: 'APPROVED',
        lifecycleStatus: 'SUPERSEDED',
        versionNumber: 1,
      },
      {
        docType: 'selfie',
        status: 'PENDING',
        lifecycleStatus: 'CURRENT',
        versionNumber: 2,
      },
      {
        docType: 'license',
        status: 'APPROVED',
        lifecycleStatus: 'CURRENT',
        versionNumber: 1,
      },
      {
        docType: 'vehicle_registration',
        status: 'APPROVED',
        lifecycleStatus: 'CURRENT',
        versionNumber: 1,
      },
      {
        docType: 'vehicle_photo',
        status: 'APPROVED',
        lifecycleStatus: 'CURRENT',
        versionNumber: 1,
      },
    ]);
    expect(progress.readyForKycApproval).toBe(false);
    expect(progress.approved).toBe(3);
  });

  it('pickLatestByType prefers higher versionNumber among CURRENT docs', () => {
    const latest = pickLatestByType([
      {
        docType: 'license',
        status: 'REJECTED',
        lifecycleStatus: 'CURRENT',
        versionNumber: 1,
        createdAt: new Date('2026-01-01'),
      },
      {
        docType: 'license',
        status: 'APPROVED',
        lifecycleStatus: 'CURRENT',
        versionNumber: 3,
        createdAt: new Date('2026-01-02'),
      },
      {
        docType: 'license',
        status: 'PENDING',
        lifecycleStatus: 'SUPERSEDED',
        versionNumber: 99,
        createdAt: new Date('2026-01-03'),
      },
    ]);
    expect(latest.license?.status).toBe('APPROVED');
    expect(latest.license?.versionNumber).toBe(3);
  });

  it('buildEligibility fails when mandatory docs missing or expired', () => {
    const now = new Date('2026-09-08T12:00:00Z');
    const missing = buildEligibility({
      docs: [
        { docType: 'selfie', status: 'APPROVED', lifecycleStatus: 'CURRENT' },
      ],
      now,
    });
    expect(missing.allPass).toBe(false);
    expect(missing.items.find((i) => i.id === 'licence')?.result).toBe('fail');
    expect(missing.items.find((i) => i.id === 'activation')?.result).toBe(
      'fail',
    );

    const expired = buildEligibility({
      docs: [
        { docType: 'selfie', status: 'APPROVED', lifecycleStatus: 'CURRENT' },
        {
          docType: 'license',
          status: 'APPROVED',
          lifecycleStatus: 'CURRENT',
          expiresAt: new Date('2026-01-01'),
        },
        {
          docType: 'vehicle_registration',
          status: 'APPROVED',
          lifecycleStatus: 'CURRENT',
        },
        {
          docType: 'vehicle_photo',
          status: 'APPROVED',
          lifecycleStatus: 'CURRENT',
        },
      ],
      now,
    });
    expect(expired.progress.expiredMandatory).toBe(true);
    expect(expired.allPass).toBe(false);
    expect(expired.items.find((i) => i.id === 'licence_valid')?.result).toBe(
      'fail',
    );
    expect(expired.items.find((i) => i.id === 'no_expired')?.result).toBe(
      'fail',
    );
  });

  it('blocks KYC approval until required docs plus vehicle photo pass', () => {
    expect(
      canApproveKyc({ readyForKycApproval: false }, false),
    ).toBe(false);
    expect(canApproveKyc({ readyForKycApproval: true }, false)).toBe(true);
    expect(canApproveKyc({ readyForKycApproval: false }, true)).toBe(true);
  });

  it('classifies waiting SLA and formats duration', () => {
    expect(waitingSla(60_000)).toBe('ok');
    expect(waitingSla(KYC_SLA_WARN_MS)).toBe('warn');
    expect(waitingSla(KYC_SLA_BREACH_MS)).toBe('breach');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(12 * 60_000)).toBe('12 min');
    expect(formatDuration(2 * 3600_000)).toBe('2 hr');
  });

  it('computes expiry bands without fabricating dates', () => {
    const now = new Date('2026-09-08T12:00:00Z');
    expect(expiryBand(null, now)).toBeNull();
    expect(expiryBand(new Date('2026-09-01T12:00:00Z'), now)).toBe('expired');
    expect(expiryBand(new Date('2026-09-12T12:00:00Z'), now)).toBe('7');
    expect(expiryBand(new Date('2026-10-20T12:00:00Z'), now)).toBeNull();
  });

  it('builds verification checks and marks OCR as unavailable', () => {
    const checks = buildVerificationChecks({
      docs: [
        { docType: 'selfie', status: 'APPROVED' },
        { docType: 'license', status: 'PENDING', expiresAt: new Date('2028-03-18') },
      ],
      vehiclePlate: 'ABC-123',
      now: new Date('2026-09-08'),
    });
    expect(checks.find((c) => c.id === 'name_match')?.result).toBe('unavailable');
    expect(checks.find((c) => c.id === 'licence_not_expired')?.result).toBe('pass');
    expect(checks.find((c) => c.id === 'plate_on_file')?.result).toBe('pass');
    expect(checks.find((c) => c.id === 'vehicle_photo_present')?.result).toBe('fail');
  });

  it('formats driver short ids and averages', () => {
    expect(driverShortId('clxyz000348abcdef')).toMatch(/^DRV-/);
    expect(averageMs([])).toBeNull();
    expect(averageMs([100, 300])).toBe(200);
    expect(percentChange(82, 100)).toBe(-18);
    expect(percentChange(10, 0)).toBeNull();
  });

  it('maps document indicators', () => {
    expect(docIndicator('APPROVED')).toBe('approved');
    expect(docIndicator('NEEDS_RESUBMISSION')).toBe('attention');
    expect(docIndicator(undefined)).toBe('missing');
  });
});
