import {
  activeDocs,
  pickLatestByType,
  progressFromDocs,
} from './kyc-ops.logic';

describe('document versioning helpers', () => {
  it('preserves superseded history while progress uses CURRENT only', () => {
    const docs = [
      {
        docType: 'license',
        status: 'REJECTED',
        lifecycleStatus: 'SUPERSEDED',
        versionNumber: 1,
        createdAt: new Date('2026-09-08T21:24:00Z'),
      },
      {
        docType: 'license',
        status: 'APPROVED',
        lifecycleStatus: 'CURRENT',
        versionNumber: 3,
        createdAt: new Date('2026-09-08T21:42:00Z'),
        expiresAt: new Date('2027-10-10'),
      },
      {
        docType: 'license',
        status: 'REJECTED',
        lifecycleStatus: 'SUPERSEDED',
        versionNumber: 2,
        createdAt: new Date('2026-09-08T21:31:00Z'),
      },
      {
        docType: 'selfie',
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
    ];

    expect(activeDocs(docs)).toHaveLength(4);
    const latest = pickLatestByType(docs);
    expect(latest.license?.versionNumber).toBe(3);
    expect(latest.license?.status).toBe('APPROVED');
    const progress = progressFromDocs(docs);
    expect(progress.readyForKycApproval).toBe(true);
    expect(progress.approved).toBe(4);
  });

  it('does not treat soft-deleted as current', () => {
    const docs = [
      {
        docType: 'selfie',
        status: 'APPROVED',
        lifecycleStatus: 'SOFT_DELETED',
        versionNumber: 1,
      },
    ];
    expect(activeDocs(docs)).toHaveLength(0);
    expect(pickLatestByType(docs).selfie).toBeUndefined();
  });
});
