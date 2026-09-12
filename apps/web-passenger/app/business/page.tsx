'use client';
import { CmsPageView } from '../../components/cms-page-view';

export default function Page() {
  return (
    <CmsPageView
      slug="business"
      kicker="Partners"
      fallbackTitle="CAN-RIDE for business"
      fallbackBody="Companies book staff and guest transfers on CAN-RIDE: request, compare offers, pay the selected trip."
    />
  );
}
