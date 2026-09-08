import {
  KYC_SLA_BREACH_MS,
  KYC_SLA_WARN_MS,
  QUEUE_DOC_TYPES,
  REQUIRED_DOC_TYPES,
  type DriverDocType,
} from './documents.constants';

export type QueueTab =
  | 'all'
  | 'awaiting'
  | 'in_review'
  | 'action_required'
  | 'approved'
  | 'rejected';

export type DocIndicator = 'approved' | 'pending' | 'attention' | 'rejected' | 'missing';

export type CheckResult = 'pass' | 'fail' | 'unavailable';

export type VerificationCheck = {
  id: string;
  label: string;
  result: CheckResult;
  detail?: string;
};

export type ReviewSignal = {
  id: string;
  label: string;
  severity: 'info' | 'warn' | 'high';
  detail?: string;
};

export function kycStatusLabel(status: string): string {
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
    default:
      return status.replace(/_/g, ' ');
  }
}

export function documentStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'Pending Review';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'NEEDS_RESUBMISSION':
      return 'Needs Resubmission';
    default:
      return status.replace(/_/g, ' ');
  }
}

export function tabForApprovalStatus(status: string): QueueTab {
  switch (status) {
    case 'PENDING_KYC':
      return 'awaiting';
    case 'IN_REVIEW':
      return 'in_review';
    case 'ACTION_REQUIRED':
      return 'action_required';
    case 'APPROVED':
      return 'approved';
    case 'REJECTED':
    case 'SUSPENDED':
      return 'rejected';
    default:
      return 'all';
  }
}

export function approvalStatusesForTab(tab?: string): string[] | undefined {
  switch (tab) {
    case 'awaiting':
      return ['PENDING_KYC'];
    case 'in_review':
      return ['IN_REVIEW'];
    case 'action_required':
      return ['ACTION_REQUIRED'];
    case 'approved':
      return ['APPROVED'];
    case 'rejected':
      return ['REJECTED'];
    case 'all':
    default:
      return undefined;
  }
}

export function driverShortId(id: string): string {
  return `DRV-${id.slice(-6).toUpperCase()}`;
}

export function waitingSla(ms: number): 'ok' | 'warn' | 'breach' {
  if (ms >= KYC_SLA_BREACH_MS) return 'breach';
  if (ms >= KYC_SLA_WARN_MS) return 'warn';
  return 'ok';
}

export function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr} hr`;
  const days = Math.floor(hr / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export type ExpiryBand = 'expired' | '7' | '14' | '30' | null;

export function expiryBand(expiresAt: Date | null | undefined, now = new Date()): ExpiryBand {
  if (!expiresAt) return null;
  const diff = expiresAt.getTime() - now.getTime();
  if (diff < 0) return 'expired';
  const days = diff / (24 * 60 * 60 * 1000);
  if (days <= 7) return '7';
  if (days <= 14) return '14';
  if (days <= 30) return '30';
  return null;
}

export function expiryLabel(expiresAt: Date | null | undefined, now = new Date()): string | null {
  if (!expiresAt) return null;
  const diff = expiresAt.getTime() - now.getTime();
  const days = Math.round(Math.abs(diff) / (24 * 60 * 60 * 1000));
  if (diff < 0) return `Expired ${days} day${days === 1 ? '' : 's'} ago`;
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
}

export type LatestDoc = {
  docType: string;
  status: string;
  expiresAt?: Date | null;
};

export function docIndicator(status: string | undefined): DocIndicator {
  if (!status) return 'missing';
  if (status === 'APPROVED') return 'approved';
  if (status === 'NEEDS_RESUBMISSION') return 'attention';
  if (status === 'REJECTED') return 'rejected';
  return 'pending';
}

export function pickLatestByType<T extends LatestDoc>(docs: T[]): Record<string, T | undefined> {
  const map: Record<string, T | undefined> = {};
  for (const type of QUEUE_DOC_TYPES) {
    const matches = docs.filter((d) => d.docType === type);
    map[type] = matches[0];
  }
  return map;
}

export function progressFromDocs(docs: LatestDoc[]) {
  const latest = pickLatestByType(docs);
  const required = REQUIRED_DOC_TYPES.map((t) => latest[t]);
  const approvedRequired = required.filter((d) => d?.status === 'APPROVED').length;
  const vehicleApproved = latest.vehicle_photo?.status === 'APPROVED';
  const totalRequired = REQUIRED_DOC_TYPES.length + 1;
  const approvedTotal = approvedRequired + (vehicleApproved ? 1 : 0);
  return {
    approved: approvedTotal,
    required: totalRequired,
    percent: Math.round((approvedTotal / totalRequired) * 100),
    requiredComplete: approvedRequired === REQUIRED_DOC_TYPES.length,
    vehicleVerified: vehicleApproved,
    readyForKycApproval: approvedRequired === REQUIRED_DOC_TYPES.length && vehicleApproved,
  };
}

export function canApproveKyc(progress: { readyForKycApproval: boolean }, override?: boolean) {
  return progress.readyForKycApproval || override === true;
}

export function buildVerificationChecks(input: {
  docs: LatestDoc[];
  profileName?: string;
  vehiclePlate?: string | null;
  now?: Date;
}): VerificationCheck[] {
  const now = input.now ?? new Date();
  const latest = pickLatestByType(input.docs);
  const checks: VerificationCheck[] = [];

  checks.push({
    id: 'selfie_present',
    label: 'Selfie submitted',
    result: latest.selfie ? 'pass' : 'fail',
    detail: latest.selfie ? undefined : 'No selfie on file',
  });

  const license = latest.license;
  checks.push({
    id: 'licence_present',
    label: 'Driving licence submitted',
    result: license ? 'pass' : 'fail',
  });

  if (license?.expiresAt) {
    const expired = license.expiresAt.getTime() < now.getTime();
    checks.push({
      id: 'licence_not_expired',
      label: 'Licence is not expired',
      result: expired ? 'fail' : 'pass',
      detail: expiryLabel(license.expiresAt, now) ?? undefined,
    });
  } else {
    checks.push({
      id: 'licence_not_expired',
      label: 'Licence is not expired',
      result: 'unavailable',
      detail: 'No expiry date on file',
    });
  }

  checks.push({
    id: 'registration_present',
    label: 'Vehicle registration submitted',
    result: latest.vehicle_registration ? 'pass' : 'fail',
  });

  checks.push({
    id: 'vehicle_photo_present',
    label: 'Vehicle photo submitted',
    result: latest.vehicle_photo ? 'pass' : 'fail',
  });

  if (input.vehiclePlate) {
    checks.push({
      id: 'plate_on_file',
      label: 'Plate matches registered vehicle',
      result: 'pass',
      detail: input.vehiclePlate,
    });
  } else {
    checks.push({
      id: 'plate_on_file',
      label: 'Plate matches registered vehicle',
      result: 'unavailable',
      detail: 'No vehicle plate on file',
    });
  }

  checks.push({
    id: 'name_match',
    label: 'Driver name matches licence',
    result: 'unavailable',
    detail: 'OCR extraction is not enabled',
  });

  return checks;
}

export function averageMs(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function percentChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function isOpenQueueStatus(status: string): boolean {
  return status === 'PENDING_KYC' || status === 'IN_REVIEW' || status === 'ACTION_REQUIRED';
}

export function driverDocType(value: string): DriverDocType | null {
  return QUEUE_DOC_TYPES.includes(value as DriverDocType)
    ? (value as DriverDocType)
    : null;
}
