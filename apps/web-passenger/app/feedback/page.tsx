'use client';
import { CmsPageView } from '../../components/cms-page-view';

export default function Page() {
  return (
    <CmsPageView
      slug="feedback"
      kicker="Product"
      fallbackTitle="Feedback"
      fallbackBody="Tell us what to improve in booking, offers, or the map. Email support@can-go.ca with the subject Feedback."
    />
  );
}
