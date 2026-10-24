'use client';

import { useEffect, useState } from 'react';
import { api, hasPermission } from '../lib/api';
import { useAuth } from '../lib/auth';

export type CancellationPolicyTierRow = {
  id: string;
  tierKey: string;
  name: string;
  windowType: 'HOURS_BEFORE_PICKUP' | 'DRIVER_ARRIVED_WAITING_EXPIRED';
  minHoursBeforePickup: number | null;
  maxHoursBeforePickup: number | null;
  passengerRefundType: 'PERCENTAGE' | 'FLAT_AMOUNT';
  passengerRefundValue: number | string;
  providerCompType: 'PERCENTAGE' | 'FLAT_AMOUNT';
  providerCompValue: number | string;
  feeTreatment: 'REFUND_TO_PASSENGER' | 'RETAIN_BY_PLATFORM';
  passengerDisplayLabel: string;
  passengerDisplayTerms: string;
  isActive: boolean;
  sortOrder: number;
};

export type SimulationResult = {
  tierKey: string;
  name: string;
  passengerDisplayLabel: string;
  passengerRefundValue: number;
  passengerRefundType: string;
  providerCompValue: number;
  providerCompType: string;
  feeTreatment: string;
  simulation: {
    totalPaid: number;
    passengerRefund: number;
    cancellationFee: number;
    providerCompensation: number;
    platformRetained: number;
  };
};

export function CancellationPolicyManager() {
  const { me } = useAuth();
  const canEdit = hasPermission(me?.permissions, 'pricing.edit');

  const [tiers, setTiers] = useState<CancellationPolicyTierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Simulation inputs
  const [simFare, setSimFare] = useState<number>(100);
  const [simFee, setSimFee] = useState<number>(20);
  const [simTax, setSimTax] = useState<number>(15.6);
  const [simResults, setSimResults] = useState<SimulationResult[] | null>(null);
  const [simulating, setSimulating] = useState(false);

  function load() {
    setLoading(true);
    setErr(null);
    api<CancellationPolicyTierRow[]>('/admin/cancellation-policy')
      .then((data) => {
        setTiers(data);
        runSimulation(data, simFare, simFee, simTax);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function saveTier(tier: CancellationPolicyTierRow) {
    setSavingKey(tier.tierKey);
    setErr(null);
    setSaveSuccess(null);
    try {
      await api(`/admin/cancellation-policy/${tier.tierKey}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: tier.name,
          minHoursBeforePickup:
            tier.minHoursBeforePickup != null
              ? Number(tier.minHoursBeforePickup)
              : null,
          maxHoursBeforePickup:
            tier.maxHoursBeforePickup != null
              ? Number(tier.maxHoursBeforePickup)
              : null,
          passengerRefundType: tier.passengerRefundType,
          passengerRefundValue: Number(tier.passengerRefundValue),
          providerCompType: tier.providerCompType,
          providerCompValue: Number(tier.providerCompValue),
          feeTreatment: tier.feeTreatment,
          passengerDisplayLabel: tier.passengerDisplayLabel,
          passengerDisplayTerms: tier.passengerDisplayTerms,
          isActive: tier.isActive,
        }),
      });
      setSaveSuccess(`Tier "${tier.name}" updated successfully.`);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingKey(null);
    }
  }

  async function runSimulation(
    _currentTiers = tiers,
    fare = simFare,
    fee = simFee,
    tax = simTax,
  ) {
    setSimulating(true);
    try {
      const res = await api<SimulationResult[]>(
        '/admin/cancellation-policy/simulate',
        {
          method: 'POST',
          body: JSON.stringify({
            rideFare: Number(fare),
            marketplaceFee: Number(fee),
            taxes: Number(tax),
          }),
        },
      );
      setSimResults(res);
    } catch {
      // Non-blocking simulation failure
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div id="cancellation" style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px' }}>
            Passenger Cancellation Policy
          </h2>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: 13.5 }}>
            Configure the 4-stage commercial policy: <strong>Cancellation Window</strong> ➔{' '}
            <strong>Passenger Refund</strong> ➔ <strong>Provider Compensation</strong> ➔{' '}
            <strong>CAN-RIDE Fee Treatment</strong>.
          </p>
        </div>
        <button className="btn ghost sm" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {err && (
        <div style={{ padding: '10px 14px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          <strong>Error:</strong> {err}
        </div>
      )}

      {saveSuccess && (
        <div style={{ padding: '10px 14px', background: 'var(--green-soft)', color: 'var(--green-dark)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ✓ {saveSuccess}
        </div>
      )}

      <div className="panel" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--line)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--panel-2)', borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontWeight: 600 }}>
                <th style={{ padding: '12px 14px', width: 200 }}>Cancellation Window</th>
                <th style={{ padding: '12px 14px', width: 140 }}>Passenger Refund</th>
                <th style={{ padding: '12px 14px', width: 140 }}>Provider Comp</th>
                <th style={{ padding: '12px 14px', width: 170 }}>CAN-RIDE Fee</th>
                <th style={{ padding: '12px 14px' }}>Customer Display Copy</th>
                <th style={{ padding: '12px 14px', width: 70, textAlign: 'center' }}>Active</th>
                {canEdit && <th style={{ padding: '12px 14px', width: 80, textAlign: 'right' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, idx) => {
                const isSaving = savingKey === tier.tierKey;
                const isNoShow = tier.windowType === 'DRIVER_ARRIVED_WAITING_EXPIRED';

                return (
                  <tr
                    key={tier.tierKey}
                    style={{
                      borderBottom: idx === tiers.length - 1 ? 'none' : '1px solid var(--line)',
                      background: isSaving ? 'rgba(0,0,0,0.02)' : 'transparent',
                    }}
                  >
                    {/* Cancellation Window */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>
                        {tier.name}
                      </div>
                      <span className="mono" style={{ fontSize: 11, background: 'var(--bg)', padding: '2px 6px', borderRadius: 4, color: 'var(--muted)' }}>
                        {tier.tierKey}
                      </span>

                      {!isNoShow ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Hours:</span>
                          <input
                            type="number"
                            className="field"
                            disabled={!canEdit || isSaving}
                            style={{ width: 55, padding: '3px 6px', fontSize: 12, margin: 0 }}
                            value={tier.minHoursBeforePickup ?? ''}
                            placeholder="Min"
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : Number(e.target.value);
                              setTiers(tiers.map((t) => (t.tierKey === tier.tierKey ? { ...t, minHoursBeforePickup: val } : t)));
                            }}
                          />
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>to</span>
                          <input
                            type="number"
                            className="field"
                            disabled={!canEdit || isSaving}
                            style={{ width: 55, padding: '3px 6px', fontSize: 12, margin: 0 }}
                            value={tier.maxHoursBeforePickup ?? ''}
                            placeholder="Max"
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : Number(e.target.value);
                              setTiers(tiers.map((t) => (t.tierKey === tier.tierKey ? { ...t, maxHoursBeforePickup: val } : t)));
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{ fontSize: 11.5, color: 'var(--warn)', marginTop: 6, fontWeight: 500 }}>
                          ⚡ Triggered on Driver Arrival + Expired Waiting
                        </div>
                      )}
                    </td>

                    {/* Passenger Refund */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          type="number"
                          className="field"
                          disabled={!canEdit || isSaving}
                          style={{ width: 65, padding: '5px 8px', margin: 0, fontWeight: 600 }}
                          value={tier.passengerRefundValue}
                          onChange={(e) => {
                            setTiers(tiers.map((t) => (t.tierKey === tier.tierKey ? { ...t, passengerRefundValue: e.target.value } : t)));
                          }}
                        />
                        <select
                          className="field"
                          disabled={!canEdit || isSaving}
                          style={{ width: 48, padding: '5px 4px', margin: 0 }}
                          value={tier.passengerRefundType}
                          onChange={(e) => {
                            setTiers(tiers.map((t) => (t.tierKey === tier.tierKey ? { ...t, passengerRefundType: e.target.value as 'PERCENTAGE' } : t)));
                          }}
                        >
                          <option value="PERCENTAGE">%</option>
                          <option value="FLAT_AMOUNT">$</option>
                        </select>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                        {Number(tier.passengerRefundValue) === 100
                          ? 'Full refund'
                          : Number(tier.passengerRefundValue) === 0
                          ? 'No refund (100% fee)'
                          : `Partial (${tier.passengerRefundValue}%)`}
                      </div>
                    </td>

                    {/* Provider Compensation */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          type="number"
                          className="field"
                          disabled={!canEdit || isSaving}
                          style={{ width: 65, padding: '5px 8px', margin: 0, fontWeight: 600 }}
                          value={tier.providerCompValue}
                          onChange={(e) => {
                            setTiers(tiers.map((t) => (t.tierKey === tier.tierKey ? { ...t, providerCompValue: e.target.value } : t)));
                          }}
                        />
                        <select
                          className="field"
                          disabled={!canEdit || isSaving}
                          style={{ width: 48, padding: '5px 4px', margin: 0 }}
                          value={tier.providerCompType}
                          onChange={(e) => {
                            setTiers(tiers.map((t) => (t.tierKey === tier.tierKey ? { ...t, providerCompType: e.target.value as 'PERCENTAGE' } : t)));
                          }}
                        >
                          <option value="PERCENTAGE">%</option>
                          <option value="FLAT_AMOUNT">$</option>
                        </select>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                        Driver payout ledger credit
                      </div>
                    </td>

                    {/* CAN-RIDE Fee Treatment */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <select
                        className="field"
                        disabled={!canEdit || isSaving}
                        style={{ width: '100%', padding: '6px 8px', margin: 0, fontWeight: 600 }}
                        value={tier.feeTreatment}
                        onChange={(e) => {
                          setTiers(tiers.map((t) => (t.tierKey === tier.tierKey ? { ...t, feeTreatment: e.target.value as 'REFUND_TO_PASSENGER' } : t)));
                        }}
                      >
                        <option value="REFUND_TO_PASSENGER">Refund to Passenger</option>
                        <option value="RETAIN_BY_PLATFORM">Retain by Platform</option>
                      </select>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                        {tier.feeTreatment === 'REFUND_TO_PASSENGER'
                          ? 'Platform fee waived/returned'
                          : 'Platform fee kept by CAN-RIDE'}
                      </div>
                    </td>

                    {/* Customer Display Copy */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <input
                        type="text"
                        className="field"
                        disabled={!canEdit || isSaving}
                        style={{ width: '100%', padding: '5px 8px', margin: '0 0 6px', fontWeight: 600 }}
                        value={tier.passengerDisplayLabel}
                        placeholder="Display Label (e.g. Full eligible refund)"
                        onChange={(e) => {
                          setTiers(tiers.map((t) => (t.tierKey === tier.tierKey ? { ...t, passengerDisplayLabel: e.target.value } : t)));
                        }}
                      />
                      <textarea
                        className="field"
                        disabled={!canEdit || isSaving}
                        rows={2}
                        style={{ width: '100%', padding: '4px 8px', margin: 0, fontSize: 12, resize: 'vertical' }}
                        value={tier.passengerDisplayTerms}
                        placeholder="Detailed terms snippet shown before payment"
                        onChange={(e) => {
                          setTiers(tiers.map((t) => (t.tierKey === tier.tierKey ? { ...t, passengerDisplayTerms: e.target.value } : t)));
                        }}
                      />
                    </td>

                    {/* Active */}
                    <td style={{ padding: '12px 14px', textAlign: 'center', verticalAlign: 'top' }}>
                      <input
                        type="checkbox"
                        disabled={!canEdit || isSaving}
                        checked={tier.isActive}
                        onChange={(e) => {
                          setTiers(tiers.map((t) => (t.tierKey === tier.tierKey ? { ...t, isActive: e.target.checked } : t)));
                        }}
                      />
                    </td>

                    {/* Save Action */}
                    {canEdit && (
                      <td style={{ padding: '12px 14px', textAlign: 'right', verticalAlign: 'top' }}>
                        <button
                          className="btn sm"
                          disabled={isSaving}
                          onClick={() => saveTier(tier)}
                          style={{ minWidth: 64 }}
                        >
                          {isSaving ? '…' : 'Save'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Commercial Policy Simulator / Sandbox */}
      <div className="panel" style={{ marginTop: 24, border: '1px solid var(--line)', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
              Commercial Policy Sandbox & Breakdown Simulator
            </h3>
            <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12.5 }}>
              Test how a sample ride fare is split across all 4 cancellation windows with the current configuration.
            </p>
          </div>
          <button
            className="btn ghost sm"
            onClick={() => runSimulation()}
            disabled={simulating}
          >
            {simulating ? 'Calculating…' : 'Recalculate Split'}
          </button>
        </div>

        {/* Inputs */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px', background: 'var(--panel-2)', borderRadius: 8, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Ride Fare ($):</span>
            <input
              type="number"
              className="field"
              style={{ width: 85, margin: 0 }}
              value={simFare}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSimFare(v);
                runSimulation(tiers, v, simFee, simTax);
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Platform Fee ($):</span>
            <input
              type="number"
              className="field"
              style={{ width: 85, margin: 0 }}
              value={simFee}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSimFee(v);
                runSimulation(tiers, simFare, v, simTax);
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Taxes ($):</span>
            <input
              type="number"
              className="field"
              style={{ width: 85, margin: 0 }}
              value={simTax}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSimTax(v);
                runSimulation(tiers, simFare, simFee, v);
              }}
            />
          </div>

          <div style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 14 }}>
            Total Charged: <span style={{ color: 'var(--brand)' }}>${(simFare + simFee + simTax).toFixed(2)} CAD</span>
          </div>
        </div>

        {/* Simulator Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {(simResults ?? []).map((res) => (
            <div
              key={res.tierKey}
              style={{
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '14px 16px',
                background: 'var(--panel)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {res.tierKey}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background:
                      res.simulation.passengerRefund > 0
                        ? 'var(--green-soft)'
                        : 'var(--danger-bg)',
                    color:
                      res.simulation.passengerRefund > 0
                        ? 'var(--green-dark)'
                        : 'var(--danger)',
                  }}
                >
                  {res.passengerDisplayLabel}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, minHeight: 36 }}>
                {res.name}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Passenger Refund:</span>
                  <span style={{ fontWeight: 800, color: res.simulation.passengerRefund > 0 ? 'var(--green-dark)' : 'var(--text)' }}>
                    ${res.simulation.passengerRefund.toFixed(2)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Cancellation Fee:</span>
                  <span style={{ fontWeight: 600 }}>
                    ${res.simulation.cancellationFee.toFixed(2)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Driver Compensation:</span>
                  <span style={{ fontWeight: 700, color: 'var(--info)' }}>
                    ${res.simulation.providerCompensation.toFixed(2)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>CAN-RIDE Retained:</span>
                  <span style={{ fontWeight: 700, color: 'var(--brand)' }}>
                    ${res.simulation.platformRetained.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
