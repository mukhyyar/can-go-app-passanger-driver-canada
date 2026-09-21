export type UserRoleFilter = '' | 'PASSENGER' | 'DRIVER' | 'DUAL' | 'ADMIN' | 'SUPER_ADMIN';
export type AccountStatusFilter = '' | 'active' | 'suspended' | 'archived' | 'anonymized';
export type KycFilter =
  | ''
  | 'PENDING_KYC'
  | 'IN_REVIEW'
  | 'ACTION_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED';

export type UsersFilters = {
  q: string;
  role: UserRoleFilter;
  status: AccountStatusFilter;
  kyc: KycFilter;
  phoneVerified: '' | 'true' | 'false';
  watchlisted: '' | 'true' | 'false';
  vip: '' | 'true';
  hasOpenCase: '' | 'true';
  registeredFrom: string;
  registeredTo: string;
  lastActiveFrom: string;
  lastActiveTo: string;
  page: number;
  pageSize: number;
  sort: string;
  order: 'asc' | 'desc';
};

export type UserStats = {
  total: number;
  passengers: number;
  drivers: number;
  dualRole?: number;
  admins: number;
  active: number;
  suspended: number;
  pendingVerification: number;
  kycPending: number;
  kycAwaiting: number;
  kycInReview: number;
  kycActionRequired: number;
  watchlisted: number;
  blocked: number;
  newToday: number;
  newThisWeek: number;
  openCases: number;
};

export type UserListRow = {
  id: string;
  email?: string | null;
  phoneE164?: string | null;
  phoneVerifiedAt?: string | null;
  role: string;
  isDualRole?: boolean;
  hasPassengerProfile?: boolean;
  hasDriverProfile?: boolean;
  roles?: string[];
  isSuspended: boolean;
  createdAt: string;
  updatedAt?: string;
  displayName: string;
  accountStatus: string;
  kycStatus?: string | null;
  rideCount?: number | null;
  lastActiveAt?: string | null;
  location?: string | null;
  plate?: string | null;
  watchlisted: boolean;
  riskBand: string;
  riskOpen: number;
  hasAvatar?: boolean;
  avatarPath?: string | null;
  avatarStorageKey?: string | null;
  passengerProfile?: {
    id: string;
    fullName?: string;
    isVip?: boolean;
  } | null;
  driverProfile?: {
    id: string;
    fullName?: string;
    approvalStatus?: string;
    isActivated?: boolean;
    baseLocation?: string;
  } | null;
  sessions?: Array<{ lastSeenAt?: string; ip?: string; userAgent?: string }>;
};

export type UsersListResponse = {
  items: UserListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type SavedUserView = {
  id: string;
  name: string;
  filters: UsersFilters;
};

export const DEFAULT_USER_FILTERS: UsersFilters = {
  q: '',
  role: '',
  status: '',
  kyc: '',
  phoneVerified: '',
  watchlisted: '',
  vip: '',
  hasOpenCase: '',
  registeredFrom: '',
  registeredTo: '',
  lastActiveFrom: '',
  lastActiveTo: '',
  page: 1,
  pageSize: 25,
  sort: 'createdAt',
  order: 'desc',
};

const VIEWS_KEY = 'cango.users.savedViews';
const SEARCH_HISTORY_KEY = 'cango.users.searchHistory';

export function usersQuery(f: UsersFilters): string {
  const p = new URLSearchParams();
  p.set('page', String(f.page));
  p.set('pageSize', String(f.pageSize));
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.role) p.set('role', f.role);
  if (f.status) p.set('status', f.status);
  if (f.kyc) p.set('kyc', f.kyc);
  if (f.phoneVerified) p.set('phoneVerified', f.phoneVerified);
  if (f.watchlisted) p.set('watchlisted', f.watchlisted);
  if (f.vip) p.set('vip', f.vip);
  if (f.hasOpenCase) p.set('hasOpenCase', f.hasOpenCase);
  if (f.registeredFrom) p.set('registeredFrom', f.registeredFrom);
  if (f.registeredTo) p.set('registeredTo', f.registeredTo);
  if (f.lastActiveFrom) p.set('lastActiveFrom', f.lastActiveFrom);
  if (f.lastActiveTo) p.set('lastActiveTo', f.lastActiveTo);
  if (f.sort) p.set('sort', f.sort);
  if (f.order) p.set('order', f.order);
  return p.toString();
}

export function activeUserFilterChips(f: UsersFilters): Array<{ key: string; label: string }> {
  const chips: Array<{ key: string; label: string }> = [];
  if (f.role) chips.push({ key: 'role', label: roleLabel(f.role) });
  if (f.status === 'active') chips.push({ key: 'status', label: 'Active' });
  if (f.status === 'suspended') chips.push({ key: 'status', label: 'Suspended' });
  if (f.status === 'archived') chips.push({ key: 'status', label: 'Archived' });
  if (f.status === 'anonymized') chips.push({ key: 'status', label: 'Anonymized' });
  if (f.kyc) chips.push({ key: 'kyc', label: `KYC ${kycShort(f.kyc)}` });
  if (f.phoneVerified === 'true') chips.push({ key: 'phoneVerified', label: 'Phone verified' });
  if (f.phoneVerified === 'false') chips.push({ key: 'phoneVerified', label: 'Phone unverified' });
  if (f.watchlisted === 'true') chips.push({ key: 'watchlisted', label: 'Watchlisted' });
  if (f.vip === 'true') chips.push({ key: 'vip', label: 'VIP' });
  if (f.hasOpenCase === 'true') chips.push({ key: 'hasOpenCase', label: 'Open cases' });
  if (f.registeredFrom || f.registeredTo) {
    chips.push({
      key: 'registered',
      label: `Registered ${f.registeredFrom || '…'} → ${f.registeredTo || '…'}`,
    });
  }
  if (f.lastActiveFrom || f.lastActiveTo) {
    chips.push({
      key: 'lastActive',
      label: `Last active ${f.lastActiveFrom || '…'} → ${f.lastActiveTo || '…'}`,
    });
  }
  if (f.q.trim()) chips.push({ key: 'q', label: `Search: ${f.q.trim()}` });
  return chips;
}

export function clearChip(f: UsersFilters, key: string): UsersFilters {
  const next = { ...f, page: 1 };
  if (key === 'role') next.role = '';
  if (key === 'status') next.status = '';
  if (key === 'kyc') next.kyc = '';
  if (key === 'phoneVerified') next.phoneVerified = '';
  if (key === 'watchlisted') next.watchlisted = '';
  if (key === 'vip') next.vip = '';
  if (key === 'hasOpenCase') next.hasOpenCase = '';
  if (key === 'registered') {
    next.registeredFrom = '';
    next.registeredTo = '';
  }
  if (key === 'lastActive') {
    next.lastActiveFrom = '';
    next.lastActiveTo = '';
  }
  if (key === 'q') next.q = '';
  return next;
}

export function roleLabel(role?: string | null) {
  switch (role) {
    case 'PASSENGER':
      return 'Passenger';
    case 'DRIVER':
      return 'Driver';
    case 'DUAL':
      return 'Driver & Passenger';
    case 'ADMIN':
      return 'Admin';
    case 'SUPER_ADMIN':
      return 'Super Admin';
    default:
      return role || '—';
  }
}

export function kycShort(status?: string | null) {
  switch (status) {
    case 'PENDING_KYC':
      return 'Pending';
    case 'IN_REVIEW':
      return 'In Review';
    case 'ACTION_REQUIRED':
      return 'Resubmit';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'SUSPENDED':
      return 'Suspended';
    default:
      return status?.replace(/_/g, ' ') || '—';
  }
}

export function relativeTime(d?: string | Date | null) {
  if (!d) return '—';
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${Math.max(0, sec)}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(d).toLocaleDateString();
}

export function shortId(id?: string | null) {
  if (!id) return '—';
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export function loadSavedUserViews(): SavedUserView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    return raw ? (JSON.parse(raw) as SavedUserView[]) : [];
  } catch {
    return [];
  }
}

export function saveSavedUserViews(views: SavedUserView[]) {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views.slice(0, 20)));
  } catch {
    /* ignore */
  }
}

export function loadSearchHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function pushSearchHistory(q: string) {
  const trimmed = q.trim();
  if (trimmed.length < 2) return;
  const next = [trimmed, ...loadSearchHistory().filter((x) => x !== trimmed)].slice(0, 8);
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function usersToCsv(rows: UserListRow[]) {
  const headers = [
    'id',
    'name',
    'email',
    'phone',
    'role',
    'status',
    'kyc',
    'risk',
    'rides',
    'lastActive',
    'registered',
    'location',
    'plate',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const vals = [
      r.id,
      r.displayName,
      r.email ?? '',
      r.phoneE164 ?? '',
      r.isDualRole ? 'DRIVER & PASSENGER' : (r.roles?.join(' & ') || r.role),
      r.accountStatus,
      r.kycStatus ?? '',
      r.riskBand,
      r.rideCount ?? '',
      r.lastActiveAt ?? '',
      r.createdAt,
      r.location ?? '',
      r.plate ?? '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type KpiKey =
  | 'total'
  | 'passengers'
  | 'drivers'
  | 'dualRole'
  | 'active'
  | 'pendingVerification'
  | 'kycPending'
  | 'suspended'
  | 'watchlisted'
  | 'newToday'
  | 'newThisWeek';

export function kpiToFilters(key: KpiKey, base: UsersFilters = DEFAULT_USER_FILTERS): UsersFilters {
  const reset: UsersFilters = {
    ...DEFAULT_USER_FILTERS,
    pageSize: base.pageSize,
    page: 1,
  };
  switch (key) {
    case 'total':
      return reset;
    case 'passengers':
      return { ...reset, role: 'PASSENGER' };
    case 'drivers':
      return { ...reset, role: 'DRIVER' };
    case 'dualRole':
      return { ...reset, role: 'DUAL' };
    case 'active':
      return { ...reset, status: 'active' };
    case 'pendingVerification':
      return { ...reset, phoneVerified: 'false' };
    case 'kycPending':
      return { ...reset, role: 'DRIVER', kyc: 'PENDING_KYC' };
    case 'suspended':
      return { ...reset, status: 'suspended' };
    case 'watchlisted':
      return { ...reset, watchlisted: 'true' };
    case 'newToday': {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return { ...reset, registeredFrom: d.toISOString() };
    }
    case 'newThisWeek': {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return { ...reset, registeredFrom: d.toISOString() };
    }
    default:
      return reset;
  }
}
