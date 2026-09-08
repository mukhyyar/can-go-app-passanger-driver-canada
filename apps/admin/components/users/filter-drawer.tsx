'use client';

import { Drawer } from '../ui';
import type { UsersFilters } from '../../lib/users';

export function UserFilterDrawer({
  draft,
  onChange,
  onClose,
  onApply,
  onReset,
}: {
  draft: UsersFilters;
  onChange: (next: UsersFilters) => void;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
}) {
  function set<K extends keyof UsersFilters>(key: K, value: UsersFilters[K]) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <Drawer
      title="Filters"
      onClose={onClose}
      width={420}
      footer={
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn ghost sm" onClick={onReset}>
            Reset
          </button>
          <div className="row">
            <button type="button" className="btn ghost sm" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn sm" onClick={onApply}>
              Apply filters
            </button>
          </div>
        </div>
      }
    >
      <div className="filter-grid">
        <label>
          <span>Role</span>
          <select className="field" value={draft.role} onChange={(e) => set('role', e.target.value as UsersFilters['role'])}>
            <option value="">Any</option>
            <option value="PASSENGER">Passenger</option>
            <option value="DRIVER">Driver</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </label>
        <label>
          <span>Account status</span>
          <select
            className="field"
            value={draft.status}
            onChange={(e) => set('status', e.target.value as UsersFilters['status'])}
          >
            <option value="">Any</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
            <option value="anonymized">Anonymized</option>
          </select>
        </label>
        <label>
          <span>KYC</span>
          <select className="field" value={draft.kyc} onChange={(e) => set('kyc', e.target.value as UsersFilters['kyc'])}>
            <option value="">Any</option>
            <option value="PENDING_KYC">Pending</option>
            <option value="IN_REVIEW">In review</option>
            <option value="ACTION_REQUIRED">Needs resubmission</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </label>
        <label>
          <span>Phone verification</span>
          <select
            className="field"
            value={draft.phoneVerified}
            onChange={(e) => set('phoneVerified', e.target.value as UsersFilters['phoneVerified'])}
          >
            <option value="">Any</option>
            <option value="true">Verified</option>
            <option value="false">Unverified</option>
          </select>
        </label>
        <label>
          <span>Watchlist</span>
          <select
            className="field"
            value={draft.watchlisted}
            onChange={(e) => set('watchlisted', e.target.value as UsersFilters['watchlisted'])}
          >
            <option value="">Any</option>
            <option value="true">On watchlist</option>
            <option value="false">Not watchlisted</option>
          </select>
        </label>
        <label>
          <span>VIP</span>
          <select className="field" value={draft.vip} onChange={(e) => set('vip', e.target.value as UsersFilters['vip'])}>
            <option value="">Any</option>
            <option value="true">VIP only</option>
          </select>
        </label>
        <label>
          <span>Support</span>
          <select
            className="field"
            value={draft.hasOpenCase}
            onChange={(e) => set('hasOpenCase', e.target.value as UsersFilters['hasOpenCase'])}
          >
            <option value="">Any</option>
            <option value="true">Has open case</option>
          </select>
        </label>
        <label>
          <span>Registered from</span>
          <input
            className="field"
            type="date"
            value={draft.registeredFrom ? draft.registeredFrom.slice(0, 10) : ''}
            onChange={(e) =>
              set('registeredFrom', e.target.value ? new Date(e.target.value).toISOString() : '')
            }
          />
        </label>
        <label>
          <span>Registered to</span>
          <input
            className="field"
            type="date"
            value={draft.registeredTo ? draft.registeredTo.slice(0, 10) : ''}
            onChange={(e) =>
              set('registeredTo', e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : '')
            }
          />
        </label>
        <label>
          <span>Last active from</span>
          <input
            className="field"
            type="date"
            value={draft.lastActiveFrom ? draft.lastActiveFrom.slice(0, 10) : ''}
            onChange={(e) =>
              set('lastActiveFrom', e.target.value ? new Date(e.target.value).toISOString() : '')
            }
          />
        </label>
        <label>
          <span>Last active to</span>
          <input
            className="field"
            type="date"
            value={draft.lastActiveTo ? draft.lastActiveTo.slice(0, 10) : ''}
            onChange={(e) =>
              set('lastActiveTo', e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : '')
            }
          />
        </label>
      </div>
    </Drawer>
  );
}
