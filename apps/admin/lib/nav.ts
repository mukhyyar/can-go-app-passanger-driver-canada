export type NavItem = {
  href: string;
  label: string;
  permission?: string;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

/** Match sidebar active state including query + hash (pathname alone is not enough). */
export function isNavActive(
  href: string,
  pathname: string,
  searchParams: URLSearchParams,
  hash = '',
): boolean {
  const url = new URL(href, 'http://local');
  const hrefPath = url.pathname;
  const hrefHash = url.hash;
  const hrefKeys = [...url.searchParams.keys()];

  if (hrefPath === '/') {
    if (pathname !== '/') return false;
  } else if (pathname !== hrefPath && !pathname.startsWith(`${hrefPath}/`)) {
    return false;
  }

  if (hrefKeys.length > 0) {
    for (const [key, value] of url.searchParams.entries()) {
      if (searchParams.get(key) !== value) return false;
    }
    return true;
  }

  if (hrefHash) {
    return pathname === hrefPath && normalizeHash(hash) === normalizeHash(hrefHash);
  }

  // Bare path: inactive when a same-path sibling owns the current query/hash.
  if (pathname === hrefPath) {
    const currentHash = normalizeHash(hash);
    if (currentHash) {
      const hashSibling = NAV.some((g) =>
        g.items.some((item) => {
          if (item.href === href) return false;
          const other = new URL(item.href, 'http://local');
          return (
            other.pathname === hrefPath &&
            other.hash &&
            normalizeHash(other.hash) === currentHash
          );
        }),
      );
      if (hashSibling) return false;
    }

    const querySibling = NAV.some((g) =>
      g.items.some((item) => {
        if (item.href === href) return false;
        const other = new URL(item.href, 'http://local');
        if (other.pathname !== hrefPath) return false;
        return [...other.searchParams.keys()].some((key) => searchParams.has(key));
      }),
    );
    if (querySibling) return false;
  }

  return true;
}

function normalizeHash(hash: string): string {
  if (!hash || hash === '#') return '';
  return hash.startsWith('#') ? hash : `#${hash}`;
}

export const NAV: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { href: '/', label: 'Command Center', permission: 'dashboard.view' },
      { href: '/live', label: 'Live Operations', permission: 'map.view' },
      { href: '/analytics', label: 'Analytics', permission: 'analytics.view' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { href: '/users', label: 'All Users', permission: 'users.view' },
      { href: '/passengers', label: 'Passengers', permission: 'users.view' },
      { href: '/drivers', label: 'Drivers', permission: 'drivers.view' },
      { href: '/kyc', label: 'KYC', permission: 'kyc.view' },
      { href: '/vehicles', label: 'Vehicles', permission: 'vehicles.view' },
      { href: '/suspended', label: 'Suspended Accounts', permission: 'users.view' },
    ],
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    items: [
      { href: '/rides?bucket=requests', label: 'Ride Requests', permission: 'rides.view' },
      { href: '/rides?bucket=active', label: 'Active Trips', permission: 'rides.view' },
      { href: '/rides?bucket=completed', label: 'Completed Rides', permission: 'rides.view' },
      { href: '/rides?bucket=cancelled', label: 'Cancelled Rides', permission: 'rides.view' },
      { href: '/offers', label: 'Bids / Offers', permission: 'offers.view' },
      { href: '/map', label: 'Live Map', permission: 'map.view' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { href: '/finance', label: 'Overview', permission: 'finance.view' },
      { href: '/payments', label: 'Transactions', permission: 'payments.view' },
      { href: '/payments', label: 'Payments', permission: 'payments.view' },
      { href: '/refunds', label: 'Refunds', permission: 'payments.view' },
      { href: '/earnings', label: 'Driver Earnings', permission: 'finance.view' },
      { href: '/wallet', label: 'Driver Wallet', permission: 'finance.view' },
      { href: '/payouts', label: 'Payout Reviews', permission: 'finance.payout_review' },
      { href: '/finance#commission', label: 'Commission', permission: 'finance.view' },
      { href: '/finance#recon', label: 'Reconciliation', permission: 'finance.view' },
    ],
  },
  {
    id: 'pricing',
    label: 'Pricing',
    items: [
      { href: '/pricing', label: 'Fare Rules', permission: 'pricing.view' },
      { href: '/pricing#services', label: 'Service Types', permission: 'pricing.view' },
      { href: '/zones', label: 'Zones', permission: 'pricing.view' },
      { href: '/pricing#taxes', label: 'Taxes', permission: 'pricing.view' },
      { href: '/promos', label: 'Promotions', permission: 'promos.view' },
    ],
  },
  {
    id: 'trust',
    label: 'Trust & Safety',
    items: [
      { href: '/ratings', label: 'Ratings', permission: 'ratings.view' },
      { href: '/chat', label: 'Ride Chats', permission: 'chat.view' },
      { href: '/risk', label: 'Risk Center', permission: 'risk.view' },
      { href: '/disputes', label: 'Disputes', permission: 'cases.view' },
      { href: '/watchlist', label: 'Watchlist', permission: 'risk.view' },
    ],
  },
  {
    id: 'support',
    label: 'Support',
    items: [
      { href: '/cases?queue=open', label: 'Cases', permission: 'cases.view' },
      { href: '/cases?queue=unassigned', label: 'Unassigned', permission: 'cases.view' },
      { href: '/cases?queue=assigned', label: 'Assigned to Me', permission: 'cases.view' },
      { href: '/cases?queue=escalated', label: 'Escalations', permission: 'cases.view' },
    ],
  },
  {
    id: 'growth',
    label: 'Growth',
    items: [
      { href: '/promos', label: 'Promotions', permission: 'promos.view' },
      { href: '/referrals', label: 'Referrals', permission: 'dashboard.view' },
      { href: '/vip', label: 'VIP', permission: 'users.vip' },
      { href: '/campaigns', label: 'Campaigns', permission: 'notifications.send' },
      { href: '/retention', label: 'Retention', permission: 'dashboard.view' },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    items: [
      { href: '/cms', label: 'CMS Pages', permission: 'cms.view' },
      { href: '/catalog', label: 'Catalog', permission: 'catalog.view' },
      { href: '/cms?kind=faq', label: 'FAQs', permission: 'cms.view' },
      { href: '/cms?kind=legal', label: 'Legal Pages', permission: 'cms.view' },
      { href: '/cms?kind=app', label: 'App Content', permission: 'cms.view' },
    ],
  },
  {
    id: 'comms',
    label: 'Communication',
    items: [
      { href: '/notifications', label: 'Notifications', permission: 'notifications.view' },
      { href: '/notifications?channel=push', label: 'Push', permission: 'notifications.view' },
      { href: '/notifications?channel=email', label: 'Email', permission: 'notifications.view' },
      { href: '/notifications?channel=sms', label: 'SMS', permission: 'notifications.view' },
      { href: '/templates', label: 'Templates', permission: 'notifications.view' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { href: '/reports?kind=rides', label: 'Ride Reports', permission: 'reports.export' },
      { href: '/reports?kind=finance', label: 'Financial Reports', permission: 'reports.export' },
      { href: '/reports?kind=drivers', label: 'Driver Reports', permission: 'reports.export' },
      { href: '/reports?kind=users', label: 'User Reports', permission: 'reports.export' },
      { href: '/reports', label: 'Custom Export', permission: 'reports.export' },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      { href: '/admins', label: 'Admin Users', permission: 'roles.manage' },
      { href: '/roles', label: 'Roles & Permissions', permission: 'roles.manage' },
      { href: '/audit', label: 'Audit Logs', permission: 'audit.view' },
      { href: '/security', label: 'Login / Security Logs', permission: 'audit.view' },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    items: [
      { href: '/health', label: 'System Health', permission: 'settings.view' },
      { href: '/webhooks', label: 'Webhooks', permission: 'settings.view' },
      { href: '/health#integrations', label: 'Integrations', permission: 'settings.view' },
      { href: '/errors', label: 'API / Errors', permission: 'settings.view' },
      { href: '/flags', label: 'Feature Flags', permission: 'settings.view' },
      { href: '/settings', label: 'Settings', permission: 'settings.view' },
    ],
  },
];
