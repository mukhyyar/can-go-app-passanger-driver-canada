'use client';
import { CmsPageView } from '../../components/cms-page-view';

export default function Page() {
  return (
    <CmsPageView
      slug="business"
      kicker="Partners"
      fallbackTitle="CAN-GO for business"
      fallbackBody="Companies book staff and guest transfers on CAN-GO: request, compare offers, pay the selected trip."
    />
  );
}
