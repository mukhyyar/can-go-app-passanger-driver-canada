'use client';

import { Suspense } from 'react';
import { BookingPage } from '../../components/booking-page';

export default function Page() {
  return (
    <Suspense fallback={<main style={{ padding: 48 }}>Loading�</main>}>
      <BookingPage />
    </Suspense>
  );
}
