'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { DataGrid } from '../../../components/data-grid';
import { StatusCell } from '../../../components/list-page';

type AdminUser = {
  id: string;
  email: string | null;
  role: string;
  adminTotpEnabled?: boolean;
  adminRole: { id: string; slug: string; name: string } | null;
};

type Role = { id: string; slug: string; name: string };

export default function AdminsPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([
        api<AdminUser[]>('/admin/admin-users'),
        api<Role[]>('/admin/roles'),
      ]);
      setUsers(u);
      setRoles(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function assign(userId: string, adminRoleId: string) {
    await api(`/admin/admin-users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ adminRoleId: adminRoleId || null }),
    });
    await load();
  }

  return (
    <div>
      <h1 className="page-title">Admin users</h1>
      <p className="page-sub">Assign an ops role. Super Admin keeps a full bypass.</p>
      <DataGrid
        rows={users as unknown as Record<string, unknown>[]}
        loading={loading}
        error={err}
        persistKey="admin-users"
        onRefresh={load}
        columns={[
          { key: 'email', label: 'Email', type: 'text' },
          { key: 'role', label: 'System role', type: 'enum' },
          {
            key: 'adminTotpEnabled',
            label: '2FA',
            type: 'boolean',
            render: (r) => (r.adminTotpEnabled ? 'on' : 'off'),
          },
          {
            key: 'adminRole',
            label: 'Ops role',
            type: 'enum',
            getValue: (r) => (r.adminRole as { name?: string } | null)?.name ?? '',
            sortable: false,
            render: (r) => (
              <select
                className="field"
                style={{ margin: 0, width: 220 }}
                value={(r.adminRole as { id?: string } | null)?.id ?? ''}
                onChange={(e) => assign(String(r.id), e.target.value)}
              >
                <option value="">—</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            ),
          },
        ]}
      />
    </div>
  );
}
