import { ConflictException } from '@nestjs/common';
import { DocumentLifecycleStatus, DocumentReviewStatus } from '@prisma/client';
import { MAX_VEHICLE_PHOTOS } from './documents.constants';

/**
 * Lightweight contract tests for vehicle photo limit semantics used by createVersion.
 * Full DB locking is covered via the transactional FOR UPDATE path in kyc-documents.service.
 */
describe('vehicle photo limit contract', () => {
  it('exposes max of 6', () => {
    expect(MAX_VEHICLE_PHOTOS).toBe(6);
  });

  it('builds conflict payload shape for Flutter', () => {
    const err = new ConflictException({
      message: `Maximum ${MAX_VEHICLE_PHOTOS} vehicle photos allowed for this vehicle`,
      code: 'VEHICLE_PHOTO_LIMIT',
      max: MAX_VEHICLE_PHOTOS,
    });
    const body = err.getResponse() as Record<string, unknown>;
    expect(body.code).toBe('VEHICLE_PHOTO_LIMIT');
    expect(body.max).toBe(6);
  });

  it('counts only CURRENT active photos', () => {
    const rows: Array<{
      lifecycleStatus: DocumentLifecycleStatus;
      status: DocumentReviewStatus;
    }> = [
      { lifecycleStatus: DocumentLifecycleStatus.CURRENT, status: DocumentReviewStatus.PENDING },
      { lifecycleStatus: DocumentLifecycleStatus.CURRENT, status: DocumentReviewStatus.APPROVED },
      { lifecycleStatus: DocumentLifecycleStatus.SUPERSEDED, status: DocumentReviewStatus.APPROVED },
      { lifecycleStatus: DocumentLifecycleStatus.SOFT_DELETED, status: DocumentReviewStatus.PENDING },
    ];
    const active = rows.filter(
      (r) =>
        r.lifecycleStatus === DocumentLifecycleStatus.CURRENT &&
        (r.status === DocumentReviewStatus.PENDING ||
          r.status === DocumentReviewStatus.APPROVED ||
          r.status === DocumentReviewStatus.NEEDS_RESUBMISSION),
    );
    expect(active).toHaveLength(2);
  });
});
