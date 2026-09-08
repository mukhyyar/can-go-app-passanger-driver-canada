'use client';
import { CmsPageView } from '../../components/cms-page-view';

export default function Page() {
  return (
    <CmsPageView
      slug="privacy"
      kicker="Legal"
      fallbackTitle="Privacy Policy"
      fallbackBody="CAN-GO collects account details, trip locations, and ride history to operate the marketplace. Driver KYC documents are reviewed by ops. We do not sell personal data. Questions: support@can-go.ca."
    />
  );
}
