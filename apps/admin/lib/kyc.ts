export const DOC_TYPES = [
  'selfie',
  'license',
  'vehicle_registration',
  'vehicle_photo',
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  selfie: 'Selfie',
  license: 'Driving Licence',
  vehicle_registration: 'Vehicle Registration',
  vehicle_photo: 'Vehicle Photo',
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
  { id: 'invalid_documents', label: 'Invalid documents' },
  { id: 'duplicate_account', label: 'Duplicate account' },
  { id: 'other', label: 'Other' },
] as const;

export type QueueTab =
  | 'all'
  | 'awaiting'
  | 'in_review'
  | 'action_required'
  | 'approved'
  | 'rejected';

export type KycTone = 'default' | 'ok' | 'warn' | 'bad' | 'info' | 'action';

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
    default:
      return status ? status.replace(/_/g, ' ') : '—';
  }
}

export function kycStatusTone(status?: string | null): KycTone {
  const v = (status ?? '').toUpperCase();
  if (v === 'ACTION_REQUIRED' || v === 'NEEDS_RESUBMISSION') return 'action';
  if (/(APPROV|ACTIVE)/.test(v)) return 'ok';
  if (v === 'IN_REVIEW') return 'info';
  if (/(PEND|WAIT|REVIEW)/.test(v)) return 'warn';
  if (/(REJECT|SUSPEND|FAIL|EXPIRED)/.test(v)) return 'bad';
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
  docType: string;
  label: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  rejectionReason?: string | null;
  resubmissionReason?: string | null;
  customerMessage?: string | null;
  expiresAt?: string | null;
  expiryLabel?: string | null;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  createdAt: string;
  updatedAt: string;
  url?: string;
};

export type VerificationCheck = {
  id: string;
  label: string;
  result: 'pass' | 'fail' | 'unavailable';
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
};

export type KycNote = {
  id: string;
  body: string;
  customerFacing: boolean;
  createdAt: string;
  author: { id: string; email?: string | null; name: string };
};

export type KycWorkspace = {
  id: string;
  userId: string;
  shortId: string;
  fullName: string;
  legalName?: string;
  approvalStatus: string;
  isActivated: boolean;
  baseLocation?: string;
  createdAt: string;
  updatedAt: string;
  kycAssignedAt?: string | null;
  kycSubmittedAt?: string | null;
  kycDecidedAt?: string | null;
  kycDecisionNote?: string | null;
  kycDecisionReason?: string | null;
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
  };
  checklist: Array<{ docType: string; label: string; status: string; indicator: DocIndicator }>;
  eligibility: {
    identityVerified: boolean;
    licenceVerified: boolean;
    vehicleVerified: boolean;
    requiredDocumentsComplete: boolean;
  };
  verificationChecks: VerificationCheck[];
  signals: ReviewSignal[];
  notes: KycNote[];
  audit: AuditEvent[];
  neighbors: { prevId: string | null; nextId: string | null };
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
