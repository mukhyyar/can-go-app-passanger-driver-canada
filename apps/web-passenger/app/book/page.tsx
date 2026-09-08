'use client';

import { Suspense } from 'react';
import { BookingPage } from '../../components/booking-page';

export default function BookPage() {
  return (
    <Suspense fallback={<div className="info-page">Loading booking…</div>}>
      <BookingPage />
    </Suspense>
  );
}
