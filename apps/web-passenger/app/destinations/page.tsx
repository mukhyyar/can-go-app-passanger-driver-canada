'use client';
import { CmsPageView } from '../../components/cms-page-view';

export default function Page() {
  return (
    <CmsPageView
      slug="destinations"
      kicker="Travel"
      fallbackTitle="Destinations"
      fallbackBody="Book airport transfers, intercity rides, hourly chauffeur, and delivery. Drivers bid, you pick the offer."
    />
  );
}
