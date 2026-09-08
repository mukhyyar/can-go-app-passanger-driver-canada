'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Role = {
  id: string;
  slug: string;
  name: string;
  isSystem?: boolean;
  permissions: Array<{ permission: string }>;
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');

  async function load() {
    const [r, c] = await Promise.all([
      api<Role[]>('/admin/roles'),
      api<{ permissions: string[] }>('/admin/permissions'),
    ]);
    setRoles(r);
    setCatalog(c.permissions);
    const next: Record<string, Set<string>> = {};
    for (const role of r) {
      next[role.id] = new Set(role.permissions.map((p) => p.permission));
    }
    setDraft(next);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  function tog(roleId: string, perm: string, locked: boolean) {
    if (locked) return;
    setDraft((d) => {
      const next = { ...d, [roleId]: new Set(d[roleId] ?? []) };
      if (next[roleId].has(perm)) next[roleId].delete(perm);
      else next[roleId].add(perm);
      return next;
    });
  }

  async function save(role: Role) {
    await api(`/admin/roles/${role.id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions: [...(draft[role.id] ?? [])] }),
    });
    setMsg(`Saved ${role.name}`);
    await load();
  }

  return (
    <div>
      <h1 className="page-title">Roles & permissions</h1>
      <p className="page-sub">Super Admin bypasses checks. Impersonate, refund, suspend, pricing.edit, and roles.manage stay tightly held.</p>
      {msg && <p className="muted">{msg}</p>}
      <div className="table-toolbar">
        <input
          className="field"
          placeholder="Search permissions…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="chip">
          {catalog.filter((p) => p.toLowerCase().includes(q.trim().toLowerCase())).length} permissions
        </span>
      </div>
      <div className="panel table-wrap" style={{ maxHeight: 720, overflow: 'auto' }}>
        <table className="perm-table">
          <thead>
            <tr>
              <th>Permission</th>
              {roles.map((r) => (
                <th key={r.id}>
                  {r.name}
                  {r.slug !== 'super-admin' && (
                    <div>
                      <button className="btn sm" onClick={() => save(r)}>Save</button>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catalog.filter((p) => p.toLowerCase().includes(q.trim().toLowerCase())).map((p) => (
              <tr key={p}>
                <td className="perm-name">{p}</td>
                {roles.map((r) => {
                  const locked = r.slug === 'super-admin';
                  const on = locked || draft[r.id]?.has(p);
                  return (
                    <td key={r.id}>
                      <input
                        type="checkbox"
                        checked={!!on}
                        disabled={locked}
                        onChange={() => tog(r.id, p, locked)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
