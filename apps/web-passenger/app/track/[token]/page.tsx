'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
import type { SharedTrip } from '../../../lib/types';
import { SiteHeader } from '../../../components/site-header';
import { SiteFooter } from '../../../components/site-footer';
import { AuthModal } from '../../../components/auth-modal';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

function formatStatus(status: string): { label: string; color: string; desc: string } {
  switch (status.toUpperCase()) {
    case 'DRIVER_EN_ROUTE':
      return {
        label: 'Driver on the way',
        color: 'bg-amber-500 text-white',
        desc: 'Your driver is heading to the pickup location.',
      };
    case 'DRIVER_ARRIVED':
      return {
        label: 'Driver arrived',
        color: 'bg-emerald-600 text-white',
        desc: 'Driver has arrived at the pickup spot.',
      };
    case 'TRIP_STARTED':
    case 'IN_PROGRESS':
      return {
        label: 'Trip in progress',
        color: 'bg-blue-600 text-white',
        desc: 'On the way to the destination.',
      };
    case 'COMPLETED':
      return {
        label: 'Trip completed',
        color: 'bg-green-700 text-white',
        desc: 'Passenger has reached their destination safely.',
      };
    case 'CANCELLED':
    case 'NO_SHOW':
      return {
        label: 'Trip cancelled',
        color: 'bg-red-600 text-white',
        desc: 'This trip was cancelled.',
      };
    default:
      return {
        label: 'Ride confirmed',
        color: 'bg-zinc-800 text-white',
        desc: 'Driver assigned, preparing for pickup.',
      };
  }
}

export default function SharedTripTrackingPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [trip, setTrip] = useState<SharedTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const hostRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  async function fetchTrip() {
    if (!token) return;
    try {
      const data = await api<SharedTrip>(`/rides/shared/${token}`);
      setTrip(data);
      setError(null);
      setLastRefreshed(new Date());
    } catch (e: any) {
      if (e?.status === 404) {
        setError('This live trip share link is invalid or has expired.');
      } else {
        setError(e?.message || 'Unable to load trip tracking. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  // Initial load and polling
  useEffect(() => {
    fetchTrip();
    const interval = setInterval(() => {
      // Keep polling while active
      if (!trip?.isCompleted && !trip?.isCancelled) {
        fetchTrip();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [token, trip?.isCompleted, trip?.isCancelled]);

  // Google Maps setup & live marker rendering
  useEffect(() => {
    if (!trip || !hostRef.current || !MAPS_KEY) return;

    function renderMap() {
      if (typeof window === 'undefined' || !window.google?.maps || !trip || !hostRef.current) return;
      const currentTrip = trip;
      const g = window.google.maps;

      const pickupCoord = { lat: currentTrip.pickup.lat, lng: currentTrip.pickup.lng };
      const dropoffCoord = currentTrip.dropoff
        ? { lat: currentTrip.dropoff.lat, lng: currentTrip.dropoff.lng }
        : null;
      const carCoord = currentTrip.live ? { lat: currentTrip.live.lat, lng: currentTrip.live.lng } : null;

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new g.Map(hostRef.current, {
          center: carCoord || pickupCoord,
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
      }
      const map = mapInstanceRef.current;

      // Clear previous overlays
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];

      const bounds = new g.LatLngBounds();

      // Pickup Marker (A)
      const pickupMarker = new g.Marker({
        map,
        position: pickupCoord,
        label: { text: 'A', color: '#fff', fontWeight: 'bold' },
        title: `Pickup: ${trip.pickup.label}`,
      });
      markersRef.current.push(pickupMarker);
      bounds.extend(pickupCoord);

      // Dropoff Marker (B)
      if (dropoffCoord) {
        const dropoffMarker = new g.Marker({
          map,
          position: dropoffCoord,
          label: { text: 'B', color: '#fff', fontWeight: 'bold' },
          title: `Destination: ${trip.dropoff?.label}`,
        });
        markersRef.current.push(dropoffMarker);
        bounds.extend(dropoffCoord);
      }

      // Live Car Marker
      if (carCoord) {
        const carMarker = new g.Marker({
          map,
          position: carCoord,
          icon: {
            path: (g as any).SymbolPath?.FORWARD_CLOSED_ARROW ?? 'M 0,-1 L 1,1 L 0,0.5 L -1,1 Z',
            scale: 5,
            fillColor: '#C8102E',
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: '#ffffff',
            rotation: trip.live?.heading ?? 0,
          },
          title: `${trip.driver?.fullName || 'Driver'} (Live)`,
        });
        markersRef.current.push(carMarker);
        bounds.extend(carCoord);
      }

      // Fit bounds
      if (dropoffCoord || carCoord) {
        map.fitBounds(bounds, 50);
      } else {
        map.setCenter(pickupCoord);
        map.setZoom(14);
      }
    }

    if (window.google?.maps) {
      renderMap();
    } else {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}`;
      script.async = true;
      script.onload = renderMap;
      document.head.appendChild(script);
    }
  }, [trip]);

  function copyShareLink() {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const statusInfo = useMemo(
    () => (trip ? formatStatus(trip.status) : null),
    [trip?.status],
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7F8] text-zinc-900">
      <SiteHeader onLogin={() => setAuthOpen(true)} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        {loading ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-zinc-200">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-zinc-200 border-t-red-600 mb-4" />
            <h2 className="text-xl font-bold text-zinc-800">Connecting to live tracking…</h2>
            <p className="text-sm text-zinc-500 mt-1">Retrieving real-time trip details.</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-zinc-200">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              !
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">Trip Link Unavailable</h2>
            <p className="text-zinc-600 max-w-md mx-auto mb-6">{error}</p>
            <a
              href="/"
              className="inline-block px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition"
            >
              Go to CAN-RIDE Home
            </a>
          </div>
        ) : trip ? (
          <div className="space-y-6">
            {/* Top Bar with Live Indicator and Share Button */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-zinc-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center">
                  <span className="flex h-3.5 w-3.5 relative">
                    {!trip.isCompleted && !trip.isCancelled && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                        trip.isCompleted
                          ? 'bg-blue-600'
                          : trip.isCancelled
                          ? 'bg-zinc-400'
                          : 'bg-emerald-500'
                      }`}
                    />
                  </span>
                </div>
                <div>
                  <h1 className="text-lg font-bold text-zinc-900 leading-tight">
                    Following {trip.passengerFirstName}&apos;s Ride
                  </h1>
                  <p className="text-xs text-zinc-500">
                    Live updates · Last refreshed {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyShareLink}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 hover:bg-zinc-50 transition text-zinc-700"
                >
                  <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {copied ? 'Link Copied!' : 'Copy Link'}
                </button>
                <button
                  type="button"
                  onClick={fetchTrip}
                  title="Refresh status now"
                  className="p-2 text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Live Status and ETA Banner */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                        statusInfo?.color || 'bg-zinc-800 text-white'
                      }`}
                    >
                      {statusInfo?.label}
                    </span>
                    <span className="text-xs text-zinc-400">· Ride #{trip.rideId.slice(-6)}</span>
                  </div>
                  <p className="text-sm text-zinc-600">{statusInfo?.desc}</p>
                </div>

                {trip.eta && !trip.isCompleted && !trip.isCancelled && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-right sm:text-right">
                    <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                      Estimated Arrival
                    </span>
                    <div className="text-2xl font-black text-emerald-700 leading-none mt-0.5">
                      ~{trip.eta.minutes} min
                    </div>
                    <span className="text-xs text-emerald-600">
                      {trip.eta.distanceKm} km to {trip.eta.target === 'PICKUP' ? 'pickup' : 'dropoff'}
                    </span>
                  </div>
                )}
              </div>

              {/* Progress Milestones Bar */}
              <div className="pt-6">
                <div className="grid grid-cols-4 gap-2 text-center text-xs font-medium text-zinc-500">
                  <div className={`flex flex-col items-center ${['BOOKED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(trip.status) ? 'text-red-600 font-bold' : ''}`}>
                    <div className={`w-3.5 h-3.5 rounded-full mb-1 ${['BOOKED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(trip.status) ? 'bg-red-600 ring-4 ring-red-100' : 'bg-zinc-200'}`} />
                    <span>Confirmed</span>
                  </div>
                  <div className={`flex flex-col items-center ${['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(trip.status) ? 'text-red-600 font-bold' : ''}`}>
                    <div className={`w-3.5 h-3.5 rounded-full mb-1 ${['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(trip.status) ? 'bg-red-600 ring-4 ring-red-100' : 'bg-zinc-200'}`} />
                    <span>On Route</span>
                  </div>
                  <div className={`flex flex-col items-center ${['DRIVER_ARRIVED', 'TRIP_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(trip.status) ? 'text-red-600 font-bold' : ''}`}>
                    <div className={`w-3.5 h-3.5 rounded-full mb-1 ${['DRIVER_ARRIVED', 'TRIP_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(trip.status) ? 'bg-red-600 ring-4 ring-red-100' : 'bg-zinc-200'}`} />
                    <span>Arrived</span>
                  </div>
                  <div className={`flex flex-col items-center ${trip.status === 'COMPLETED' ? 'text-green-600 font-bold' : ''}`}>
                    <div className={`w-3.5 h-3.5 rounded-full mb-1 ${trip.status === 'COMPLETED' ? 'bg-green-600 ring-4 ring-green-100' : 'bg-zinc-200'}`} />
                    <span>Completed</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Map Container */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-zinc-200">
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Live Route Map
                </span>
                {trip.live && (
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    GPS Connected
                  </span>
                )}
              </div>
              <div
                ref={hostRef}
                className="w-full h-80 bg-zinc-100 relative"
              >
                {!MAPS_KEY && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
                    <svg className="w-12 h-12 text-zinc-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    <p className="text-sm font-semibold">Live GPS Active</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      Pickup: {trip.pickup.label}
                    </p>
                    {trip.dropoff && (
                      <p className="text-xs text-zinc-400">
                        Dropoff: {trip.dropoff.label}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Driver & Vehicle Information Card */}
            {trip.driver ? (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-200">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4">
                  Verified Driver & Vehicle
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  {/* Driver Profile */}
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-zinc-200 overflow-hidden flex-shrink-0 border-2 border-white shadow-sm flex items-center justify-center font-bold text-lg text-zinc-600">
                      {trip.driver.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={trip.driver.avatarUrl}
                          alt={trip.driver.fullName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        trip.driver.firstName[0] || 'D'
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900 leading-tight">
                        {trip.driver.fullName}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600">
                          ★ {trip.driver.rating.toFixed(1)}
                        </span>
                        <span className="text-xs text-zinc-400">· Verified Driver</span>
                      </div>
                    </div>
                  </div>

                  {/* Vehicle Details */}
                  {trip.driver.vehicle && (
                    <div className="flex items-center gap-4 bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                      <div>
                        <p className="text-sm font-bold text-zinc-900">
                          {trip.driver.vehicle.makeModel}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {trip.driver.vehicle.color} · {trip.driver.vehicle.vehicleClass}
                        </p>
                      </div>

                      {/* Canadian License Plate Badge */}
                      <div className="bg-white border-2 border-blue-900 rounded px-2.5 py-1 shadow-sm text-center">
                        <div className="text-[9px] font-bold tracking-widest text-blue-900 uppercase leading-none">
                          CANADA
                        </div>
                        <div className="text-sm font-black tracking-wider text-zinc-900 font-mono leading-none mt-0.5">
                          {trip.driver.vehicle.plate}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Pickup & Destination Details */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-200">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4">
                Trip Route
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                    A
                  </div>
                  <div>
                    <span className="text-xs text-zinc-400 font-semibold uppercase">Pickup</span>
                    <p className="text-sm font-semibold text-zinc-900">{trip.pickup.label}</p>
                  </div>
                </div>

                {trip.dropoff && (
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                      B
                    </div>
                    <div>
                      <span className="text-xs text-zinc-400 font-semibold uppercase">Dropoff</span>
                      <p className="text-sm font-semibold text-zinc-900">{trip.dropoff.label}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Safety & Emergency Note */}
            <div className="bg-red-50/70 border border-red-200/80 rounded-2xl p-5 flex items-start gap-3 text-red-900">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-xs leading-relaxed">
                <p className="font-bold text-red-950 mb-0.5">CAN-RIDE Safety & Protection</p>
                <p className="text-red-800">
                  Every ride is monitored with active GPS and insured commercial coverage. If you are concerned about your friend or if there is an emergency, call <strong>911</strong> immediately, then reach out to CAN-RIDE Support.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </main>

      <SiteFooter />
    </div>
  );
}
