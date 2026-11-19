'use client';

import { useEffect, useState } from 'react';
import { api, hasPermission } from '../lib/api';
import { useAuth } from '../lib/auth';

type VehicleCategoryItem = {
  id: string;
  catalogId?: string;
  slug: string;
  name: string;
  description: string;
  basePrice: number;
  fromPrice: string;
  currency: string;
  passengerSeats: number;
  luggagePlaces: number;
  seatsRange: string | null;
  imageAsset: string;
  isLuxury: boolean;
  sortOrder: number;
  active: boolean;
};

const EMPTY_CATEGORY = {
  slug: '',
  name: '',
  basePrice: '45',
  passengerSeats: '4',
  luggagePlaces: '2',
  seatsRange: '',
  isLuxury: false,
  sortOrder: '10',
  active: true,
};

export function VehicleCategoriesManager() {
  const { me } = useAuth();
  const canEdit = hasPermission(me?.permissions, 'pricing.edit');
  const [items, setItems] = useState<VehicleCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newCat, setNewCat] = useState(EMPTY_CATEGORY);

  function load() {
    setLoading(true);
    setErr(null);
    api<VehicleCategoryItem[]>('/admin/vehicle-categories')
      .then((res) => setItems(Array.isArray(res) ? res : []))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function createCategory() {
    if (!newCat.name.trim()) {
      setErr('Category name is required');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api('/admin/vehicle-categories', {
        method: 'POST',
        body: JSON.stringify({
          slug: newCat.slug.trim() || undefined,
          name: newCat.name.trim(),
          basePrice: Number(newCat.basePrice || 25),
          passengerSeats: Number(newCat.passengerSeats || 4),
          luggagePlaces: Number(newCat.luggagePlaces || 2),
          seatsRange: newCat.seatsRange.trim() || null,
          isLuxury: newCat.isLuxury,
          sortOrder: Number(newCat.sortOrder || 10),
          active: newCat.active,
        }),
      });
      setNewCat(EMPTY_CATEGORY);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory(cat: VehicleCategoryItem) {
    setSaving(true);
    setErr(null);
    try {
      await api(`/admin/vehicle-categories/${cat.catalogId || cat.slug}`, {
        method: 'PUT',
        body: JSON.stringify({
          slug: cat.slug,
          name: cat.name,
          description: cat.description,
          basePrice: Number(cat.basePrice),
          passengerSeats: Number(cat.passengerSeats),
          luggagePlaces: Number(cat.luggagePlaces),
          seatsRange: cat.seatsRange,
          imageAsset: cat.imageAsset,
          isLuxury: Boolean(cat.isLuxury),
          sortOrder: Number(cat.sortOrder),
          active: Boolean(cat.active),
        }),
      });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory(cat: VehicleCategoryItem) {
    setSaving(true);
    setErr(null);
    try {
      await api(`/admin/vehicle-categories/${cat.catalogId || cat.slug}`, {
        method: 'DELETE',
      });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof VehicleCategoryItem>(
    idx: number,
    key: K,
    value: VehicleCategoryItem[K],
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [key]: value } : item)),
    );
  }

  return (
    <div className="panel" id="vehicle-categories" style={{ marginTop: 24 }}>
      <div
        className="row"
        style={{ justifyContent: 'space-between', marginBottom: 12 }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            Passenger Vehicle Preference Categories
          </h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Configure the vehicle categories passengers can select as their
            preference when creating a ride enquiry (e.g., Economy, Comfort,
            Premium, SUV, 7-Seater / Minivan, Luxury Vehicle). All eligible
            drivers can still view and submit offers on any enquiry.
          </p>
        </div>
        <button className="btn ghost sm" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {err && <p className="error">{err}</p>}

      {canEdit && (
        <div
          className="row"
          style={{
            flexWrap: 'wrap',
            gap: 8,
            padding: 12,
            marginBottom: 14,
            borderRadius: 8,
            background: 'var(--bg-subtle, #f8fafc)',
            border: '1px solid var(--border, #e2e8f0)',
          }}
        >
          <input
            className="field"
            style={{ width: 150, margin: 0 }}
            placeholder="Category Name (e.g. Luxury Vehicle)"
            value={newCat.name}
            onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
          />
          <input
            className="field"
            style={{ width: 110, margin: 0 }}
            placeholder="Key (e.g. luxury)"
            value={newCat.slug}
            onChange={(e) => setNewCat({ ...newCat, slug: e.target.value })}
          />
          <input
            className="field"
            style={{ width: 84, margin: 0 }}
            placeholder="From CAD"
            value={newCat.basePrice}
            onChange={(e) => setNewCat({ ...newCat, basePrice: e.target.value })}
          />
          <input
            className="field"
            style={{ width: 72, margin: 0 }}
            placeholder="Seats"
            value={newCat.passengerSeats}
            onChange={(e) =>
              setNewCat({ ...newCat, passengerSeats: e.target.value })
            }
          />
          <input
            className="field"
            style={{ width: 72, margin: 0 }}
            placeholder="Bags"
            value={newCat.luggagePlaces}
            onChange={(e) =>
              setNewCat({ ...newCat, luggagePlaces: e.target.value })
            }
          />
          <input
            className="field"
            style={{ width: 96, margin: 0 }}
            placeholder="Range (7 - 8)"
            value={newCat.seatsRange}
            onChange={(e) =>
              setNewCat({ ...newCat, seatsRange: e.target.value })
            }
          />
          <input
            className="field"
            style={{ width: 64, margin: 0 }}
            placeholder="Order"
            value={newCat.sortOrder}
            onChange={(e) => setNewCat({ ...newCat, sortOrder: e.target.value })}
          />
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={newCat.isLuxury}
              onChange={(e) =>
                setNewCat({ ...newCat, isLuxury: e.target.checked })
              }
            />
            Luxury badge
          </label>
          <button
            className="btn sm"
            disabled={saving}
            onClick={createCategory}
          >
            Add Category
          </button>
        </div>
      )}

      {loading ? (
        <p className="muted">Loading vehicle categories…</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Key</th>
                <th>Display Name</th>
                <th>From (CAD)</th>
                <th>Max Seats</th>
                <th>Bags</th>
                <th>Seats Range</th>
                <th>Order</th>
                <th>Luxury</th>
                <th>Active</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((cat, idx) => (
                <tr key={cat.catalogId || cat.slug}>
                  <td className="mono">{cat.slug}</td>
                  <td>
                    <input
                      className="field"
                      style={{ margin: 0, width: 155 }}
                      value={cat.name}
                      disabled={!canEdit}
                      onChange={(e) => updateField(idx, 'name', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="field"
                      style={{ margin: 0, width: 76 }}
                      type="number"
                      value={cat.basePrice}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateField(idx, 'basePrice', Number(e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="field"
                      style={{ margin: 0, width: 64 }}
                      type="number"
                      value={cat.passengerSeats}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateField(
                          idx,
                          'passengerSeats',
                          Number(e.target.value),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="field"
                      style={{ margin: 0, width: 64 }}
                      type="number"
                      value={cat.luggagePlaces}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateField(
                          idx,
                          'luggagePlaces',
                          Number(e.target.value),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="field"
                      style={{ margin: 0, width: 84 }}
                      placeholder="optional"
                      value={cat.seatsRange ?? ''}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateField(
                          idx,
                          'seatsRange',
                          e.target.value.trim() || null,
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="field"
                      style={{ margin: 0, width: 58 }}
                      type="number"
                      value={cat.sortOrder}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateField(idx, 'sortOrder', Number(e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={cat.isLuxury}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateField(idx, 'isLuxury', e.target.checked)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={cat.active}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateField(idx, 'active', e.target.checked)
                      }
                    />
                  </td>
                  {canEdit && (
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          className="btn sm"
                          disabled={saving}
                          onClick={() => saveCategory(cat)}
                        >
                          Save
                        </button>
                        <button
                          className="btn ghost sm"
                          disabled={saving}
                          onClick={() => removeCategory(cat)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
