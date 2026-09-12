'use client';
import { CmsPageView } from '../../components/cms-page-view';

export default function Page() {
  return (
    <CmsPageView
      slug="drivers"
      kicker="Partners"
      fallbackTitle="Drive with CAN-RIDE"
      fallbackBody="Set your zone, complete KYC, and bid on passenger requests. You keep control of your price."
    />
  );
}
