'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { Modal, Chip } from '../ui';
import { useToast } from '../toast';

export type CreatedUserResult = {
  id: string;
  role: 'PASSENGER' | 'DRIVER';
  fullName: string;
  email?: string | null;
  phoneE164: string;
  temporaryPassword?: string;
  phoneVerified: boolean;
  createdAt: string;
};

export function CreateUserModal({
  initialRole = 'PASSENGER',
  onClose,
  onCreated,
}: {
  initialRole?: 'PASSENGER' | 'DRIVER';
  onClose: () => void;
  onCreated?: (user: CreatedUserResult) => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [role, setRole] = useState<'PASSENGER' | 'DRIVER'>(initialRole);
  const [fullName, setFullName] = useState('');
  const [phoneE164, setPhoneE164] = useState('+1');
  const [email, setEmail] = useState('');
  const [useCustomPassword, setUseCustomPassword] = useState(false);
  const [customPassword, setCustomPassword] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(true);

  // Passenger fields
  const [isVip, setIsVip] = useState(false);

  // Driver fields
  const [approvalStatus, setApprovalStatus] = useState<'APPROVED' | 'PENDING_KYC' | 'IN_REVIEW' | 'ACTION_REQUIRED'>('APPROVED');
  const [isActivated, setIsActivated] = useState(true);
  const [baseLocation, setBaseLocation] = useState('');
  const [addVehicle, setAddVehicle] = useState(true);
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleClass, setVehicleClass] = useState('sedan');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createdUser, setCreatedUser] = useState<CreatedUserResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setErr('Full name is required');
      return;
    }

    const trimmedPhone = phoneE164.trim();
    if (!trimmedPhone || !/^\+[1-9]\d{7,14}$/.test(trimmedPhone)) {
      setErr('Phone number must be in E.164 format starting with + and country code (e.g. +14165551234)');
      return;
    }

    if (useCustomPassword && customPassword.trim().length < 8) {
      setErr('Password must be at least 8 characters');
      return;
    }

    if (role === 'DRIVER' && addVehicle && vehiclePlate.trim() && !vehicleClass.trim()) {
      setErr('Please select a vehicle category');
      return;
    }

    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        role,
        fullName: trimmedName,
        phoneE164: trimmedPhone,
        email: email.trim() || undefined,
        password: useCustomPassword ? customPassword.trim() : undefined,
        phoneVerified,
      };

      if (role === 'PASSENGER') {
        payload.isVip = isVip;
      } else {
        payload.approvalStatus = approvalStatus;
        payload.isActivated = isActivated;
        payload.baseLocation = baseLocation.trim() || undefined;

        if (addVehicle && vehiclePlate.trim()) {
          payload.vehicleMake = vehicleMake.trim() || undefined;
          payload.vehicleModel = vehicleModel.trim() || undefined;
          payload.vehicleYear = vehicleYear.trim() ? Number(vehicleYear.trim()) : undefined;
          payload.vehicleColor = vehicleColor.trim() || undefined;
          payload.vehiclePlate = vehiclePlate.trim();
          payload.vehicleClass = vehicleClass.trim().toLowerCase();
        }
      }

      const res = await api<CreatedUserResult>('/admin/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setCreatedUser(res);
      toast.push(`${role === 'DRIVER' ? 'Driver' : 'Passenger'} account created`);
      onCreated?.(res);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.push(`${label} copied`);
    } catch {
      toast.push(`Could not copy ${label}`, 'bad');
    }
  }

  function copyAllLoginDetails() {
    if (!createdUser) return;
    const lines = [
      `Role: ${createdUser.role}`,
      `Name: ${createdUser.fullName}`,
      `Phone: ${createdUser.phoneE164}`,
      createdUser.email ? `Email: ${createdUser.email}` : null,
      createdUser.temporaryPassword ? `Password: ${createdUser.temporaryPassword}` : null,
      `Account ID: ${createdUser.id}`,
    ]
      .filter(Boolean)
      .join('\n');

    void copyToClipboard(lines, 'All credentials');
  }

  function resetForm() {
    setCreatedUser(null);
    setFullName('');
    setPhoneE164('+1');
    setEmail('');
    setUseCustomPassword(false);
    setCustomPassword('');
    setBaseLocation('');
    setVehicleMake('');
    setVehicleModel('');
    setVehicleYear('');
    setVehicleColor('');
    setVehiclePlate('');
    setErr(null);
  }

  return (
    <Modal title={createdUser ? 'Account Created' : `Create ${role === 'DRIVER' ? 'Driver' : 'Passenger'} Account`} onClose={onClose}>
      <div style={{ maxWidth: 640 }}>
        {createdUser ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  background: '#16a34a',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 'bold',
                }}
              >
                ✓
              </div>
              <div>
                <strong style={{ display: 'block', fontSize: 15, color: '#15803d' }}>
                  {createdUser.role === 'DRIVER' ? 'Driver' : 'Passenger'} account created successfully
                </strong>
                <span className="muted" style={{ fontSize: 13 }}>
                  Share the credentials securely with the user.
                </span>
              </div>
            </div>

            <div className="panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="label-xs muted">Role & Name</span>
                <Chip tone={createdUser.role === 'DRIVER' ? 'ok' : 'info'}>{createdUser.role}</Chip>
              </div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{createdUser.fullName}</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
                <div>
                  <span className="label-xs muted">Phone (Login ID)</span>
                  <div className="mono" style={{ fontSize: 14 }}>{createdUser.phoneE164}</div>
                </div>
                <div>
                  <span className="label-xs muted">Email</span>
                  <div style={{ fontSize: 14 }}>{createdUser.email || '—'}</div>
                </div>
              </div>

              {createdUser.temporaryPassword && (
                <div style={{ marginTop: 8 }}>
                  <span className="label-xs muted" style={{ display: 'block', marginBottom: 4 }}>
                    Password (shown once)
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="field mono"
                      readOnly
                      value={createdUser.temporaryPassword}
                      style={{ marginBottom: 0, flex: 1, fontWeight: 'bold' }}
                    />
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => void copyToClipboard(createdUser.temporaryPassword!, 'Password')}
                    >
                      Copy Password
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn ghost sm" onClick={copyAllLoginDetails}>
                Copy All Credentials
              </button>
              <button type="button" className="btn ghost sm" onClick={resetForm}>
                Create Another
              </button>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  onClose();
                  router.push(`/users/${createdUser.id}`);
                }}
              >
                View Profile
              </button>
              <button type="button" className="btn sm" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Role Switcher Tabs */}
            <div>
              <span className="label-xs muted" style={{ display: 'block', marginBottom: 6 }}>
                Account Type
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`btn sm ${role === 'PASSENGER' ? '' : 'ghost'}`}
                  style={{ flex: 1, padding: '8px 12px' }}
                  onClick={() => setRole('PASSENGER')}
                >
                  👤 Passenger
                </button>
                <button
                  type="button"
                  className={`btn sm ${role === 'DRIVER' ? '' : 'ghost'}`}
                  style={{ flex: 1, padding: '8px 12px' }}
                  onClick={() => setRole('DRIVER')}
                >
                  🚗 Driver
                </button>
              </div>
            </div>

            {err && (
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 8,
                  color: '#b91c1c',
                  fontSize: 13,
                }}
              >
                {err}
              </div>
            )}

            {/* Basic Information */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label>
                  <span className="label-xs muted">Full Name *</span>
                  <input
                    className="field"
                    required
                    placeholder="e.g. Jane Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    style={{ marginBottom: 0 }}
                  />
                </label>
              </div>

              <div>
                <label>
                  <span className="label-xs muted">Phone (E.164 format) *</span>
                  <input
                    className="field mono"
                    required
                    placeholder="+14035550199"
                    value={phoneE164}
                    onChange={(e) => setPhoneE164(e.target.value)}
                    style={{ marginBottom: 0 }}
                  />
                </label>
                <span className="muted" style={{ fontSize: 11 }}>
                  Include country code (e.g. +1 for Canada/US)
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label>
                  <span className="label-xs muted">Email (optional)</span>
                  <input
                    type="email"
                    className="field"
                    placeholder="e.g. user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ marginBottom: 0 }}
                  />
                </label>
              </div>

              <div>
                <label>
                  <span className="label-xs muted">Phone Verification</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                    <input
                      type="checkbox"
                      id="cu-phone-verified"
                      checked={phoneVerified}
                      onChange={(e) => setPhoneVerified(e.target.checked)}
                    />
                    <label htmlFor="cu-phone-verified" style={{ fontSize: 13, cursor: 'pointer' }}>
                      Mark as verified (instant login)
                    </label>
                  </div>
                </label>
              </div>
            </div>

            {/* Password Section */}
            <div className="panel" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="label-xs muted">Password Setup</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={useCustomPassword}
                    onChange={(e) => setUseCustomPassword(e.target.checked)}
                  />
                  Set custom password
                </label>
              </div>

              {useCustomPassword ? (
                <div style={{ marginTop: 8 }}>
                  <input
                    type="password"
                    className="field mono"
                    placeholder="Enter password (min 8 characters)"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    style={{ marginBottom: 0 }}
                  />
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                  A secure temporary password (e.g. <code>CR-a1b2c3d4e5f6</code>) will be auto-generated and displayed upon creation.
                </p>
              )}
            </div>

            {/* Role-Specific Sections */}
            {role === 'PASSENGER' ? (
              <div className="panel" style={{ padding: 12 }}>
                <span className="label-xs muted" style={{ display: 'block', marginBottom: 8 }}>
                  Passenger Preferences
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isVip}
                    onChange={(e) => setIsVip(e.target.checked)}
                  />
                  <span>
                    <strong>VIP Passenger Status</strong>
                    <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                      Grants priority booking and VIP badge in admin and mobile apps
                    </span>
                  </span>
                </label>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Driver KYC and Status */}
                <div className="panel" style={{ padding: 12 }}>
                  <span className="label-xs muted" style={{ display: 'block', marginBottom: 8 }}>
                    Driver Approval & Status
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label>
                        <span className="label-xs muted">KYC / Approval Status</span>
                        <select
                          className="field"
                          value={approvalStatus}
                          onChange={(e) => {
                            const val = e.target.value as typeof approvalStatus;
                            setApprovalStatus(val);
                            if (val === 'APPROVED') setIsActivated(true);
                          }}
                          style={{ marginBottom: 0 }}
                        >
                          <option value="APPROVED">Approved (Ready to drive)</option>
                          <option value="PENDING_KYC">Pending KYC (Documents required)</option>
                          <option value="IN_REVIEW">In Review</option>
                          <option value="ACTION_REQUIRED">Action Required</option>
                        </select>
                      </label>
                    </div>

                    <div>
                      <label>
                        <span className="label-xs muted">Base Location / City</span>
                        <input
                          className="field"
                          placeholder="e.g. Calgary, AB"
                          value={baseLocation}
                          onChange={(e) => setBaseLocation(e.target.value)}
                          style={{ marginBottom: 0 }}
                        />
                      </label>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isActivated}
                        onChange={(e) => setIsActivated(e.target.checked)}
                      />
                      <span>
                        <strong>Activate immediately</strong>
                        <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                          Allows the driver to go online and receive marketplace ride offers right away
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                {/* Driver Vehicle (Optional) */}
                <div className="panel" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span className="label-xs muted">Vehicle Details</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={addVehicle}
                        onChange={(e) => setAddVehicle(e.target.checked)}
                      />
                      Add initial vehicle
                    </label>
                  </div>

                  {addVehicle && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <input
                            className="field"
                            placeholder="Make (e.g. Toyota)"
                            value={vehicleMake}
                            onChange={(e) => setVehicleMake(e.target.value)}
                            style={{ marginBottom: 0 }}
                          />
                        </div>
                        <div>
                          <input
                            className="field"
                            placeholder="Model (e.g. Camry)"
                            value={vehicleModel}
                            onChange={(e) => setVehicleModel(e.target.value)}
                            style={{ marginBottom: 0 }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <div>
                          <input
                            className="field"
                            placeholder="Year (e.g. 2023)"
                            value={vehicleYear}
                            onChange={(e) => setVehicleYear(e.target.value)}
                            style={{ marginBottom: 0 }}
                          />
                        </div>
                        <div>
                          <input
                            className="field"
                            placeholder="Color (e.g. Black)"
                            value={vehicleColor}
                            onChange={(e) => setVehicleColor(e.target.value)}
                            style={{ marginBottom: 0 }}
                          />
                        </div>
                        <div>
                          <input
                            className="field mono"
                            placeholder="Plate (e.g. ABC-123)"
                            value={vehiclePlate}
                            onChange={(e) => setVehiclePlate(e.target.value)}
                            style={{ marginBottom: 0 }}
                          />
                        </div>
                      </div>

                      <div>
                        <label>
                          <span className="label-xs muted">Vehicle Class</span>
                          <select
                            className="field"
                            value={vehicleClass}
                            onChange={(e) => setVehicleClass(e.target.value)}
                            style={{ marginBottom: 0 }}
                          >
                            <option value="sedan">Sedan (Standard)</option>
                            <option value="comfort">Comfort</option>
                            <option value="suv">SUV</option>
                            <option value="van">Van / Minivan</option>
                            <option value="luxury">Luxury</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn sm" disabled={busy}>
                {busy ? 'Creating...' : `Create ${role === 'DRIVER' ? 'Driver' : 'Passenger'}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

