'use client';
import { CmsPageView } from '../../components/cms-page-view';

export default function Page() {
  return (
    <CmsPageView
      slug="support"
      kicker="Help center"
      fallbackTitle="Support"
      fallbackBody={`CAN-GO support helps with bookings, driver offers, payments, and account access.

## Contact

- **Passenger support:** [support@can-go.ca](mailto:support@can-go.ca)
- **Driver & partner desk:** [partner@can-go.ca](mailto:partner@can-go.ca)

Open **My trips** for a booking already in progress, then email support with your ride code if you need a refund or complaint.`}
    />
  );
}
