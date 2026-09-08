/** Canonical driver KYC document types. */
export const DRIVER_DOC_TYPES = [
  'selfie',
  'license',
  'vehicle_registration',
  'vehicle_photo',
  'insurance',
  'driver_abstract',
  'background_check',
  'work_eligibility',
  'inspection_certificate',
  'profile_photo',
  'supporting_document',
  'other',
] as const;

export type DriverDocType = (typeof DRIVER_DOC_TYPES)[number];

/** Mandatory for activation (legacy Phase 1b checklist). */
export const REQUIRED_DOC_TYPES: DriverDocType[] = [
  'selfie',
  'license',
  'vehicle_registration',
];

/** Shown in admin queue glyphs / default checklist. */
export const QUEUE_DOC_TYPES: DriverDocType[] = [
  'selfie',
  'license',
  'vehicle_registration',
  'vehicle_photo',
];

/** Types that allow only one CURRENT document (replacements create versions). */
export const SINGLE_ACTIVE_DOC_TYPES: DriverDocType[] = [
  'selfie',
  'license',
  'vehicle_registration',
  'insurance',
  'driver_abstract',
  'background_check',
  'work_eligibility',
  'inspection_certificate',
  'profile_photo',
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
  insurance: 'Insurance',
  driver_abstract: 'Driver Abstract',
  background_check: 'Background Check',
  work_eligibility: 'Work Eligibility',
  inspection_certificate: 'Inspection Certificate',
  profile_photo: 'Profile Photo',
  supporting_document: 'Supporting Document',
  other: 'Other',
};

export const DOCUMENT_UPLOAD_SOURCES = [
  'DRIVER_APP',
  'PASSENGER_APP',
  'ADMIN_PORTAL',
  'EMAIL',
  'SUPPORT',
  'IN_PERSON',
  'MANUAL_VERIFICATION',
  'MIGRATION',
  'API',
  'OTHER',
] as const;

export type DocumentUploadSource = (typeof DOCUMENT_UPLOAD_SOURCES)[number];

export const ADMIN_RECEIPT_SOURCES = [
  { id: 'EMAIL', label: 'Customer email' },
  { id: 'SUPPORT', label: 'Support ticket' },
  { id: 'IN_PERSON', label: 'In person' },
  { id: 'MANUAL_VERIFICATION', label: 'Manual verification / admin correction' },
  { id: 'MIGRATION', label: 'Migration' },
  { id: 'OTHER', label: 'Other' },
] as const;

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
  'expired_document',
  'fraud_concern',
  'document_unreadable',
  'information_mismatch',
  'eligibility_failure',
  'duplicate_account',
  'invalid_documents',
  'other',
] as const;

export type KycRejectReason = (typeof KYC_REJECT_REASONS)[number];

export const KYC_REJECT_REASON_LABELS: Record<KycRejectReason, string> = {
  fraud_suspicion: 'Fraud suspicion',
  identity_mismatch: 'Identity mismatch',
  invalid_licence: 'Invalid licence',
  expired_document: 'Expired document',
  fraud_concern: 'Fraud concern',
  document_unreadable: 'Document unreadable',
  information_mismatch: 'Information mismatch',
  eligibility_failure: 'Eligibility failure',
  duplicate_account: 'Duplicate account',
  invalid_documents: 'Invalid documents',
  other: 'Other',
};

export const KYC_FLAG_TYPES = [
  'FRAUD_CONCERN',
  'IDENTITY_MISMATCH',
  'DUPLICATE_ACCOUNT',
  'DOCUMENT_CONCERN',
  'HIGH_RISK',
  'MANUAL_REVIEW',
  'VIP_ESCALATION',
  'OTHER',
] as const;

/** Queue SLA: warn after 4h, breach after 24h. */
export const KYC_SLA_WARN_MS = 4 * 60 * 60 * 1000;
export const KYC_SLA_BREACH_MS = 24 * 60 * 60 * 1000;
