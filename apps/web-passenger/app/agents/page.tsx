'use client';
import { CmsPageView } from '../../components/cms-page-view';

export default function Page() {
  return (
    <CmsPageView
      slug="agents"
      kicker="Partners"
      fallbackTitle="For travel agents"
      fallbackBody="Book CAN-RIDE transfers for clients with the passenger booking form. Register interest at partner@can-go.ca."
    />
  );
}
