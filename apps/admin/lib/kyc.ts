export const DOC_TYPES = [
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

export type DocType = (typeof DOC_TYPES)[number];

/** Queue glyph columns / default checklist (matches backend QUEUE_DOC_TYPES). */
export const QUEUE_DOC_TYPES = [
  'selfie',
  'license',
  'vehicle_registration',
  'vehicle_photo',
] as const;

export type QueueDocType = (typeof QUEUE_DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
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

export const UPLOAD_SOURCES = [
  'EMAIL',
  'SUPPORT',
  'IN_PERSON',
  'MANUAL_VERIFICATION',
  'MIGRATION',
  'OTHER',
] as const;

export type UploadSource = (typeof UPLOAD_SOURCES)[number];

export const UPLOAD_SOURCE_LABELS: Record<UploadSource, string> = {
  EMAIL: 'Customer email',
  SUPPORT: 'Support ticket',
  IN_PERSON: 'In person',
  MANUAL_VERIFICATION: 'Manual verification',
  MIGRATION: 'Migration',
  OTHER: 'Other',
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

export type KycFlagType = (typeof KYC_FLAG_TYPES)[number];

export const KYC_FLAG_LABELS: Record<KycFlagType, string> = {
  FRAUD_CONCERN: 'Fraud concern',
  IDENTITY_MISMATCH: 'Identity mismatch',
  DUPLICATE_ACCOUNT: 'Duplicate account',
  DOCUMENT_CONCERN: 'Document concern',
  HIGH_RISK: 'High risk',
  MANUAL_REVIEW: 'Manual review',
  VIP_ESCALATION: 'VIP escalation',
  OTHER: 'Other',
};

export const RESUBMISSION_REASONS = [
  { id: 'image_unclear', label: 'Image unclear' },
  { id: 'document_cropped', label: 'Document cropped' },
  { id: 'information_unreadable', label: 'Information unreadable' },
  { id: 'document_expired', label: 'Document expired' },
  { id: 'wrong_document', label: 'Wrong document' },
  { id: 'details_mismatch', label: 'Details mismatch' },
  { id: 'other', label: 'Other' },
] as const;

export const KYC_REJECT_REASONS = [
  { id: 'fraud_suspicion', label: 'Fraud suspicion' },
  { id: 'identity_mismatch', label: 'Identity mismatch' },
  { id: 'invalid_licence', label: 'Invalid licence' },
  { id: 'expired_document', label: 'Expired document' },
  { id: 'fraud_concern', label: 'Fraud concern' },
  { id: 'document_unreadable', label: 'Document unreadable' },
  { id: 'information_mismatch', label: 'Information mismatch' },
  { id: 'eligibility_failure', label: 'Eligibility failure' },
  { id: 'duplicate_account', label: 'Duplicate account' },
  { id: 'invalid_documents', label: 'Invalid documents' },
  { id: 'other', label: 'Other' },
] as const;

export const ALLOWED_UPLOAD_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type QueueTab =
  | 'all'
  | 'awaiting'
  | 'in_review'
  | 'action_required'
  | 'approved'
  | 'rejected';

export type KycTone = 'default' | 'ok' | 'warn' | 'bad' | 'info' | 'action';

export type DocLifecycleStatus = 'CURRENT' | 'SUPERSEDED' | 'ARCHIVED' | 'SOFT_DELETED';

export function kycStatusLabel(status?: string | null): string {
  switch (status) {
    case 'PENDING_KYC':
      return 'Pending Review';
    case 'IN_REVIEW':
      return 'In Review';
    case 'ACTION_REQUIRED':
      return 'Action Required';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'SUSPENDED':
      return 'Suspended';
    case 'PENDING':
      return 'Pending Review';
    case 'NEEDS_RESUBMISSION':
      return 'Needs Resubmission';
    case 'MISSING':
      return 'Missing';
    case 'CURRENT':
      return 'Current';
    case 'SUPERSEDED':
      return 'Superseded';
    case 'ARCHIVED':
      return 'Archived';
    case 'SOFT_DELETED':
      return 'Deleted';
    default:
      return status ? status.replace(/_/g, ' ') : '—';
  }
}

export function kycStatusTone(status?: string | null): KycTone {
  const v = (status ?? '').toUpperCase();
  if (v === 'ACTION_REQUIRED' || v === 'NEEDS_RESUBMISSION') return 'action';
  if (/(APPROV|ACTIVE|CURRENT)/.test(v)) return 'ok';
  if (v === 'IN_REVIEW') return 'info';
  if (/(PEND|WAIT|REVIEW)/.test(v)) return 'warn';
  if (/(REJECT|SUSPEND|FAIL|EXPIRED|SUPERSEDED|SOFT_DELETED)/.test(v)) return 'bad';
  if (v === 'ARCHIVED') return 'default';
  return 'default';
}

export function accountLabel(status?: string | null, isActivated?: boolean, isSuspended?: boolean): string {
  if (isSuspended || status === 'suspended') return 'Suspended';
  if (status === 'active' || isActivated) return 'Active';
  return 'Inactive';
}

export function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function formatWhen(d?: string | Date | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(d?: string | Date | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
}

export function formatTime(d?: string | Date | null): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function relativeFrom(d?: string | Date | null, now = Date.now()): string {
  if (!d) return '—';
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return '—';
  const ms = Math.max(0, now - t);
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} second${sec === 1 ? '' : 's'} ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const days = Math.floor(hr / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function bytesLabel(n?: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function sourceLabel(source?: string | null): string {
  if (!source) return '—';
  if (source in UPLOAD_SOURCE_LABELS) return UPLOAD_SOURCE_LABELS[source as UploadSource];
  return source.replace(/_/g, ' ');
}

export function validateUploadFile(file: File): string | null {
  if (!ALLOWED_UPLOAD_MIME.has(file.type)) {
    return 'Only PDF, JPG, PNG, or WebP files are allowed.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File must be under ${bytesLabel(MAX_UPLOAD_BYTES)}.`;
  }
  return null;
}

export function isoDateInput(d?: string | Date | null): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

export type DocIndicator = 'approved' | 'pending' | 'attention' | 'rejected' | 'missing';

export type QueueDocCell = {
  status: string | null;
  indicator: DocIndicator;
  expiresAt?: string | null;
};

export type KycQueueRow = {
  id: string;
  userId: string;
  shortId: string;
  fullName: string;
  approvalStatus: string;
  isActivated: boolean;
  isSuspended: boolean;
  email?: string | null;
  phone?: string | null;
  progress: { approved: number; required: number; percent: number; readyForKycApproval: boolean };
  docs: Record<string, QueueDocCell>;
  submittedAt: string;
  waitingMs: number;
  waitingLabel: string;
  waitingSla: 'ok' | 'warn' | 'breach';
  accountStatus: string;
  flags: Array<{ id: string; label: string }>;
  reviewer: { id: string; email?: string | null; name: string } | null;
  vehicle: { id: string; name: string; plate: string; vehicleClass: string } | null;
  zones: string[];
  updatedAt: string;
};

export type KycStats = {
  awaiting: number;
  inReview: number;
  actionRequired: number;
  approvedToday: number;
  rejectedToday: number;
  avgReviewMs: number | null;
  avgReviewLabel: string | null;
  avgReviewChangePct: number | null;
  awaitingDelta: number;
  tabs: Record<string, number>;
};

export type KycQueueResponse = {
  items: KycQueueRow[];
  total: number;
  page: number;
  pageSize: number;
  generatedAt: string;
  stats: KycStats;
  tabCounts: Record<string, number>;
};

export type KycDocument = {
  id: string;
  driverId: string;
  vehicleId?: string | null;
  documentGroupId: string;
  docType: string;
  customLabel?: string | null;
  label: string;
  versionNumber: number;
  lifecycleStatus: DocLifecycleStatus | string;
  previousVersionId?: string | null;
  originalFilename?: string | null;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
  status: string;
  rejectionReason?: string | null;
  resubmissionReason?: string | null;
  customerMessage?: string | null;
  documentNumber?: string | null;
  issueDate?: string | null;
  expiresAt?: string | null;
  expiryLabel?: string | null;
  issuingJurisdiction?: string | null;
  uploadSource?: string | null;
  sourceReference?: string | null;
  adminNote?: string | null;
  uploadedById?: string | null;
  uploadedByType?: string | null;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  softDeletedAt?: string | null;
  archivedAt?: string | null;
  isCurrent: boolean;
  isHistorical: boolean;
  createdAt: string;
  updatedAt: string;
  url?: string;
};

export type DocVersionSummary = {
  id: string;
  versionNumber: number;
  lifecycleStatus: string;
  status: string;
  createdAt: string;
  uploadSource: string;
  expiresAt?: string | null;
  docType: string;
};

export type VerificationCheck = {
  id: string;
  label: string;
  result: 'pass' | 'fail' | 'unavailable' | 'warn';
  detail?: string;
};

export type ReviewSignal = {
  id: string;
  label: string;
  severity: 'info' | 'warn' | 'high';
  detail?: string;
};

export type AuditEvent = {
  id: string;
  at: string;
  action: string;
  label: string;
  actor: string;
  actorId?: string | null;
  resource?: string | null;
  resourceId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown> | null;
};

export type KycNote = {
  id: string;
  body: string;
  customerFacing: boolean;
  createdAt: string;
  author: { id: string; email?: string | null; name: string };
};

export type EligibilityItem = {
  id: string;
  label: string;
  result: 'pass' | 'fail' | 'warn';
  docType?: string;
  detail?: string;
};

export type KycFlag = {
  id: string;
  flagType: string;
  reason: string;
  note?: string | null;
  createdById?: string | null;
  createdAt: string;
};

export type DocumentTypeCatalog = {
  id: string;
  label: string;
  required: boolean;
  queue: boolean;
};

export type CaseHealth = {
  current: number;
  superseded: number;
  archived: number;
  softDeleted: number;
  pendingReview: number;
  approved: number;
  rejected: number;
  needsResubmission: number;
  activeFlags: number;
};

export type ChecklistItem = {
  docType: string;
  label: string;
  status: string;
  indicator: DocIndicator;
  documentId?: string | null;
  versionCount?: number;
  uploadSource?: string | null;
  expiryLabel?: string | null;
  lifecycleStatus?: string | null;
};

export type KycWorkspace = {
  id: string;
  userId: string;
  shortId: string;
  fullName: string;
  legalName?: string | null;
  isIndividual?: boolean;
  approvalStatus: string;
  isActivated: boolean;
  baseLocation?: string | null;
  dateOfBirth?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  licenceNumber?: string | null;
  licenceJurisdiction?: string | null;
  licenceIssueDate?: string | null;
  licenceExpiryDate?: string | null;
  createdAt: string;
  updatedAt: string;
  kycAssignedAt?: string | null;
  kycSubmittedAt?: string | null;
  kycDecidedAt?: string | null;
  kycDecisionNote?: string | null;
  kycDecisionReason?: string | null;
  kycCustomerMessage?: string | null;
  kycOverrideUsed?: boolean;
  kycOverrideReason?: string | null;
  kycOverrideAt?: string | null;
  kycOverrideById?: string | null;
  suspensionReason?: string | null;
  suspendedAt?: string | null;
  reviewer: { id: string; email?: string | null; name: string } | null;
  user: {
    id: string;
    email?: string | null;
    phoneE164?: string | null;
    isSuspended: boolean;
    createdAt: string;
    lastSeenAt?: string | null;
  };
  vehicles: Array<{
    id: string;
    name: string;
    plate: string;
    vehicleClass: string;
    amenitiesJson?: unknown;
  }>;
  operatingZones: Array<{ id: string; name: string; zoneType: string }>;
  documents: KycDocument[];
  latestByType: Record<string, KycDocument | null>;
  progress: {
    approved: number;
    required: number;
    percent: number;
    readyForKycApproval: boolean;
    requiredComplete: boolean;
    vehicleVerified: boolean;
    expiredMandatory?: boolean;
  };
  checklist: ChecklistItem[];
  eligibility: {
    identityVerified: boolean;
    licenceVerified: boolean;
    vehicleVerified: boolean;
    requiredDocumentsComplete: boolean;
    items?: EligibilityItem[];
    allPass?: boolean;
    progress?: KycWorkspace['progress'];
  };
  verificationChecks: VerificationCheck[];
  signals: ReviewSignal[];
  notes: KycNote[];
  audit: AuditEvent[];
  neighbors: { prevId: string | null; nextId: string | null };
  flags: KycFlag[];
  documentTypes: DocumentTypeCatalog[];
  versionsByGroup: Record<string, DocVersionSummary[]>;
  caseHealth: CaseHealth;
  canApproveKyc: boolean;
  canActivate: boolean;
};

export type QueueFilters = {
  tab: QueueTab;
  q: string;
  accountStatus: string;
  datePreset: string;
  documentStatus: string;
  vehicleStatus: string;
  expiring: string;
  zone: string;
  page: number;
  pageSize: number;
};

export const DEFAULT_FILTERS: QueueFilters = {
  tab: 'all',
  q: '',
  accountStatus: '',
  datePreset: '',
  documentStatus: '',
  vehicleStatus: '',
  expiring: '',
  zone: '',
  page: 1,
  pageSize: 25,
};

export function queueQuery(f: QueueFilters): string {
  const p = new URLSearchParams();
  p.set('tab', f.tab);
  p.set('page', String(f.page));
  p.set('pageSize', String(f.pageSize));
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.accountStatus) p.set('accountStatus', f.accountStatus);
  if (f.datePreset) p.set('datePreset', f.datePreset);
  if (f.documentStatus) p.set('documentStatus', f.documentStatus);
  if (f.vehicleStatus) p.set('vehicleStatus', f.vehicleStatus);
  if (f.expiring) p.set('expiring', f.expiring);
  if (f.zone.trim()) p.set('zone', f.zone.trim());
  return p.toString();
}

export function activeFilterChips(f: QueueFilters): Array<{ key: keyof QueueFilters; label: string }> {
  const chips: Array<{ key: keyof QueueFilters; label: string }> = [];
  if (f.q.trim()) chips.push({ key: 'q', label: `Search: ${f.q.trim()}` });
  if (f.accountStatus) chips.push({ key: 'accountStatus', label: `Account: ${f.accountStatus}` });
  if (f.datePreset) {
    const map: Record<string, string> = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' };
    chips.push({ key: 'datePreset', label: map[f.datePreset] ?? f.datePreset });
  }
  if (f.documentStatus) chips.push({ key: 'documentStatus', label: `Docs: ${kycStatusLabel(f.documentStatus)}` });
  if (f.vehicleStatus) chips.push({ key: 'vehicleStatus', label: `Vehicle: ${f.vehicleStatus}` });
  if (f.expiring) chips.push({ key: 'expiring', label: f.expiring === 'expired' ? 'Expired docs' : `Expiring ${f.expiring}d` });
  if (f.zone.trim()) chips.push({ key: 'zone', label: `Zone: ${f.zone}` });
  return chips;
}

const VIEWS_KEY = 'cango.kyc.savedViews';

export type SavedView = { id: string; name: string; filters: QueueFilters };

export function loadSavedViews(): SavedView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function saveSavedViews(views: SavedView[]) {
  localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
}

export function canPerm(perms: string[] | undefined, ...need: string[]) {
  if (!perms) return false;
  if (perms.includes('*')) return true;
  return need.some((n) => perms.includes(n));
}

export function toCsv(rows: KycQueueRow[]): string {
  const headers = [
    'Driver',
    'Driver ID',
    'Email',
    'Phone',
    'KYC Status',
    'Progress',
    'Submitted',
    'Waiting',
    'Account',
    'Reviewer',
    'Plate',
  ];
  const lines = rows.map((r) =>
    [
      r.fullName,
      r.shortId,
      r.email ?? '',
      r.phone ?? '',
      kycStatusLabel(r.approvalStatus),
      `${r.progress.approved}/${r.progress.required}`,
      r.submittedAt,
      r.waitingLabel,
      accountLabel(r.accountStatus),
      r.reviewer?.name ?? '',
      r.vehicle?.plate ?? '',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [headers.join(','), ...lines].join('\n');
}

export function downloadText(filename: string, text: string, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function auditCategory(action: string, resource?: string | null): 'documents' | 'kyc' | 'account' | 'admin' | 'system' {
  const a = (action ?? '').toLowerCase();
  if (a.includes('document') || resource === 'DriverDocument') return 'documents';
  if (a.includes('kyc') || a.includes('flag') || resource === 'KycReviewNote') return 'kyc';
  if (a.includes('activate') || a.includes('deactivate') || a.includes('suspend')) return 'account';
  if (a.includes('admin') || a.includes('impersonat') || a.includes('override') || a.includes('assign')) return 'admin';
  if (!a.includes('.') && !a.startsWith('admin')) return 'system';
  return 'admin';
}

export function findDocForType(workspace: KycWorkspace, docType: string): KycDocument | null {
  const latest = workspace.latestByType[docType];
  if (latest) return latest;
  const current = workspace.documents.find((d) => d.docType === docType && d.isCurrent);
  if (current) return current;
  return workspace.documents.find((d) => d.docType === docType) ?? null;
}
