'use client';
import { CmsPageView } from '../../components/cms-page-view';

export default function Page() {
  return (
    <CmsPageView
      slug="terms"
      kicker="Legal"
      fallbackTitle="Service Agreement"
      fallbackBody="CAN-RIDE is a marketplace: passengers request a transfer, drivers bid, and you choose an offer before paying. Prices shown are server-authoritative. Cancellation and waiting rules are shown before you confirm."
    />
  );
}
