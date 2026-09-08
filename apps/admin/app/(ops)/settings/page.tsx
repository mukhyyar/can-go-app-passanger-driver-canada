'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

export default function SettingsPage() {
  const [setup, setSetup] = useState<{ otpauthUrl?: string; secret?: string } | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  async function begin() {
    setSetup(await api('/auth/admin/2fa/setup', { method: 'POST' }));
  }
  async function enable() {
    await api('/auth/admin/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
    setMsg('2FA enabled');
  }
  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <div className="panel">
        <h3>Admin 2FA (TOTP)</h3>
        <button className="btn sm" onClick={begin}>Setup</button>
        {setup?.otpauthUrl && <p className="mono">{setup.otpauthUrl}</p>}
        <input className="field" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn" onClick={enable}>Enable</button>
        {msg && <p className="muted">{msg}</p>}
      </div>
    </div>
  );
}
