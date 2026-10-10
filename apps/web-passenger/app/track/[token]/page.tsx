'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';
import type { SharedTrip } from '../../../lib/types';
import { SiteHeader } from '../../../components/site-header';
import { SiteFooter } from '../../../components/site-footer';
import { AuthModal } from '../../../components/auth-modal';
import styles from './track.module.css';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

function formatStatus(status: string): { label: string; color: string; desc: string } {
  switch (status.toUpperCase()) {
    case 'DRIVER_EN_ROUTE':
      return {
        label: 'Driver on the way',
        color: styles.statusAmber,
        desc: 'Your driver is heading to the pickup location.',
      };
    case 'DRIVER_ARRIVED':
      return {
        label: 'Driver arrived',
        color: styles.statusEmerald,
        desc: 'Driver has arrived at the pickup spot.',
      };
    case 'TRIP_STARTED':
    case 'IN_PROGRESS':
      return {
        label: 'Trip in progress',
        color: styles.statusBlue,
        desc: 'On the way to the destination.',
      };
    case 'COMPLETED':
      return {
        label: 'Trip completed',
        color: styles.statusGreen,
        desc: 'Passenger has reached their destination safely.',
      };
    case 'CANCELLED':
    case 'NO_SHOW':
      return {
        label: 'Trip cancelled',
        color: styles.statusRed,
        desc: 'This trip was cancelled.',
      };
    default:
      return {
        label: 'Ride confirmed',
        color: styles.statusZinc,
        desc: 'Driver assigned, preparing for pickup.',
      };
  }
}

function milestoneReached(status: string, step: 'confirmed' | 'onRoute' | 'arrived' | 'completed') {
  const s = status.toUpperCase();
  if (step === 'confirmed') {
    return ['BOOKED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(s);
  }
  if (step === 'onRoute') {
    return ['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(s);
  }
  if (step === 'arrived') {
    return ['DRIVER_ARRIVED', 'TRIP_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(s);
  }
  return s === 'COMPLETED';
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

  const confirmed = trip ? milestoneReached(trip.status, 'confirmed') : false;
  const onRoute = trip ? milestoneReached(trip.status, 'onRoute') : false;
  const arrived = trip ? milestoneReached(trip.status, 'arrived') : false;
  const completed = trip ? milestoneReached(trip.status, 'completed') : false;

  return (
    <div className={styles.page}>
      <SiteHeader onLogin={() => setAuthOpen(true)} />

      <main className={styles.main}>
        {loading ? (
          <div className={`${styles.card} ${styles.cardPadLg} ${styles.cardCenter}`}>
            <div className={styles.spinner} />
            <h2 className={styles.loadingTitle}>Connecting to live tracking…</h2>
            <p className={styles.loadingSub}>Retrieving real-time trip details.</p>
          </div>
        ) : error ? (
          <div className={`${styles.card} ${styles.cardPadLg} ${styles.cardCenter}`}>
            <div className={styles.errorIcon}>!</div>
            <h2 className={styles.errorTitle}>Trip Link Unavailable</h2>
            <p className={styles.errorBody}>{error}</p>
            <a href="/" className={styles.homeCta}>
              Go to CAN-RIDE Home
            </a>
          </div>
        ) : trip ? (
          <div className={styles.stack}>
            {/* Top Bar with Live Indicator and Share Button */}
            <div className={`${styles.card} ${styles.cardPadSm} ${styles.topBar}`}>
              <div className={styles.topBarLeft}>
                <div className={styles.liveDotWrap}>
                  {!trip.isCompleted && !trip.isCancelled && (
                    <span className={styles.livePing} />
                  )}
                  <span
                    className={`${styles.liveDot} ${
                      trip.isCompleted
                        ? styles.liveDotDone
                        : trip.isCancelled
                        ? styles.liveDotCancelled
                        : styles.liveDotActive
                    }`}
                  />
                </div>
                <div>
                  <h1 className={styles.title}>
                    Following {trip.passengerFirstName}&apos;s Ride
                  </h1>
                  <p className={styles.meta}>
                    Live updates · Last refreshed{' '}
                    {lastRefreshed.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              <div className={styles.actions}>
                <button type="button" onClick={copyShareLink} className={styles.btnGhost}>
                  <svg className={styles.iconSm} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  {copied ? 'Link Copied!' : 'Copy Link'}
                </button>
                <button
                  type="button"
                  onClick={fetchTrip}
                  title="Refresh status now"
                  className={styles.btnIcon}
                >
                  <svg className={styles.iconSm} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Live Status and ETA Banner */}
            <div className={`${styles.card} ${styles.cardPad}`}>
              <div className={styles.statusRow}>
                <div>
                  <div className={styles.badgeRow}>
                    <span className={`${styles.badge} ${statusInfo?.color || styles.statusZinc}`}>
                      {statusInfo?.label}
                    </span>
                    <span className={styles.rideId}>· Ride #{trip.rideId.slice(-6)}</span>
                  </div>
                  <p className={styles.statusDesc}>{statusInfo?.desc}</p>
                </div>

                {trip.eta && !trip.isCompleted && !trip.isCancelled && (
                  <div className={styles.etaBox}>
                    <span className={styles.etaLabel}>Estimated Arrival</span>
                    <div className={styles.etaValue}>~{trip.eta.minutes} min</div>
                    <span className={styles.etaSub}>
                      {trip.eta.distanceKm} km to{' '}
                      {trip.eta.target === 'PICKUP' ? 'pickup' : 'dropoff'}
                    </span>
                  </div>
                )}
              </div>

              {/* Progress Milestones Bar */}
              <div className={styles.milestones}>
                <div className={styles.milestoneGrid}>
                  <div
                    className={`${styles.milestone} ${confirmed ? styles.milestoneActive : ''}`}
                  >
                    <div
                      className={`${styles.milestoneDot} ${
                        confirmed ? styles.milestoneDotActive : ''
                      }`}
                    />
                    <span>Confirmed</span>
                  </div>
                  <div className={`${styles.milestone} ${onRoute ? styles.milestoneActive : ''}`}>
                    <div
                      className={`${styles.milestoneDot} ${
                        onRoute ? styles.milestoneDotActive : ''
                      }`}
                    />
                    <span>On Route</span>
                  </div>
                  <div className={`${styles.milestone} ${arrived ? styles.milestoneActive : ''}`}>
                    <div
                      className={`${styles.milestoneDot} ${
                        arrived ? styles.milestoneDotActive : ''
                      }`}
                    />
                    <span>Arrived</span>
                  </div>
                  <div
                    className={`${styles.milestone} ${completed ? styles.milestoneDone : ''}`}
                  >
                    <div
                      className={`${styles.milestoneDot} ${
                        completed ? styles.milestoneDotDone : ''
                      }`}
                    />
                    <span>Completed</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Map Container */}
            <div className={`${styles.card} ${styles.cardOverflow}`}>
              <div className={styles.mapHeader}>
                <span className={styles.sectionLabel}>Live Route Map</span>
                {trip.live && (
                  <span className={styles.gpsBadge}>
                    <span className={styles.gpsPulse} />
                    GPS Connected
                  </span>
                )}
              </div>
              <div ref={hostRef} className={styles.mapHost}>
                {!MAPS_KEY && (
                  <div className={styles.mapFallback}>
                    <svg
                      className={styles.mapFallbackIcon}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                      />
                    </svg>
                    <p className={styles.mapFallbackTitle}>Live GPS Active</p>
                    <p className={styles.mapFallbackMeta}>Pickup: {trip.pickup.label}</p>
                    {trip.dropoff && (
                      <p className={styles.mapFallbackMeta}>Dropoff: {trip.dropoff.label}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Driver & Vehicle Information Card */}
            {trip.driver ? (
              <div className={`${styles.card} ${styles.cardPad}`}>
                <div className={styles.sectionLabelSpaced}>Verified Driver & Vehicle</div>
                <div className={styles.driverRow}>
                  <div className={styles.driverProfile}>
                    <div className={styles.avatar}>
                      {trip.driver.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={trip.driver.avatarUrl}
                          alt={trip.driver.fullName}
                          className={styles.avatarImg}
                        />
                      ) : (
                        trip.driver.firstName[0] || 'D'
                      )}
                    </div>
                    <div>
                      <h3 className={styles.driverName}>{trip.driver.fullName}</h3>
                      <div className={styles.driverMeta}>
                        <span className={styles.rating}>
                          ★ {trip.driver.rating.toFixed(1)}
                        </span>
                        <span className={styles.verified}>· Verified Driver</span>
                      </div>
                    </div>
                  </div>

                  {trip.driver.vehicle && (
                    <div className={styles.vehicleBox}>
                      <div>
                        <p className={styles.vehicleName}>{trip.driver.vehicle.makeModel}</p>
                        <p className={styles.vehicleMeta}>
                          {trip.driver.vehicle.color} · {trip.driver.vehicle.vehicleClass}
                        </p>
                      </div>
                      <div className={styles.plate}>
                        <div className={styles.plateLabel}>CANADA</div>
                        <div className={styles.plateValue}>{trip.driver.vehicle.plate}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Pickup & Destination Details */}
            <div className={`${styles.card} ${styles.cardPad}`}>
              <div className={styles.sectionLabelSpaced}>Trip Route</div>
              <div className={styles.routeStack}>
                <div className={styles.routeStop}>
                  <div className={`${styles.stopBadge} ${styles.stopPickup}`}>A</div>
                  <div>
                    <span className={styles.stopLabel}>Pickup</span>
                    <p className={styles.stopAddress}>{trip.pickup.label}</p>
                  </div>
                </div>

                {trip.dropoff && (
                  <div className={styles.routeStop}>
                    <div className={`${styles.stopBadge} ${styles.stopDropoff}`}>B</div>
                    <div>
                      <span className={styles.stopLabel}>Dropoff</span>
                      <p className={styles.stopAddress}>{trip.dropoff.label}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Safety & Emergency Note */}
            <div className={styles.safety}>
              <svg
                className={styles.safetyIcon}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className={styles.safetyBody}>
                <p className={styles.safetyTitle}>CAN-RIDE Safety & Protection</p>
                <p className={styles.safetyText}>
                  Every ride is monitored with active GPS and insured commercial coverage. If you
                  are concerned about your friend or if there is an emergency, call{' '}
                  <strong>911</strong> immediately, then reach out to CAN-RIDE Support.
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
