/** Canonical driver KYC document types (Phase 1b). */
export const DRIVER_DOC_TYPES = [
  'selfie',
  'license',
  'vehicle_registration',
  'vehicle_photo',
] as const;

export type DriverDocType = (typeof DRIVER_DOC_TYPES)[number];

export const REQUIRED_DOC_TYPES: DriverDocType[] = [
  'selfie',
  'license',
  'vehicle_registration',
];

export const MAX_VEHICLE_PHOTOS = 6;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const DOC_TYPE_LABELS: Record<DriverDocType, string> = {
  selfie: 'Selfie',
  license: 'Driving Licence',
  vehicle_registration: 'Vehicle Registration',
  vehicle_photo: 'Vehicle Photo',
};

export const RESUBMISSION_REASONS = [
  'image_unclear',
  'document_cropped',
  'information_unreadable',
  'document_expired',
  'wrong_document',
  'details_mismatch',
  'other',
] as const;

export type ResubmissionReason = (typeof RESUBMISSION_REASONS)[number];

export const RESUBMISSION_REASON_LABELS: Record<ResubmissionReason, string> = {
  image_unclear: 'Image unclear',
  document_cropped: 'Document cropped',
  information_unreadable: 'Information unreadable',
  document_expired: 'Document expired',
  wrong_document: 'Wrong document',
  details_mismatch: 'Details mismatch',
  other: 'Other',
};

export const KYC_REJECT_REASONS = [
  'fraud_suspicion',
  'identity_mismatch',
  'invalid_licence',
  'invalid_documents',
  'duplicate_account',
  'other',
] as const;

export type KycRejectReason = (typeof KYC_REJECT_REASONS)[number];

export const KYC_REJECT_REASON_LABELS: Record<KycRejectReason, string> = {
  fraud_suspicion: 'Fraud suspicion',
  identity_mismatch: 'Identity mismatch',
  invalid_licence: 'Invalid licence',
  invalid_documents: 'Invalid documents',
  duplicate_account: 'Duplicate account',
  other: 'Other',
};

/** Queue SLA: warn after 4h, breach after 24h. */
export const KYC_SLA_WARN_MS = 4 * 60 * 60 * 1000;
export const KYC_SLA_BREACH_MS = 24 * 60 * 60 * 1000;

export const QUEUE_DOC_TYPES: DriverDocType[] = [
  'selfie',
  'license',
  'vehicle_registration',
  'vehicle_photo',
];
