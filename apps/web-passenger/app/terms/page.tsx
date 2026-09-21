'use client';

import { CmsPageView } from '../../components/cms-page-view';

const TERMS_SERVICE_MD = `*Last updated: March 2026*

Welcome to **CAN-RIDE**. This Service Agreement ("Agreement") governs your access to and use of the CAN-RIDE marketplace website, applications, content, and transfer booking services across Canada.

By accessing or using CAN-RIDE as a passenger, carrier, or driver, you agree to be bound by these terms.

---

### 1. Marketplace Model & Role of CAN-RIDE

CAN-RIDE operates an online marketplace technology platform connecting passengers seeking transportation services with independent transportation carriers and licensed drivers ("Drivers").

- **Independent Provider Status:** CAN-RIDE is a technology provider, not a motor carrier, transportation broker, or taxi dispatcher. CAN-RIDE does not provide transportation services directly and does not employ Drivers.
- **Direct Transportation Contract:** When a passenger accepts an offer submitted by a Driver, a direct contract for transportation services is created between the passenger and that Driver (or their affiliated fleet carrier).
- **Platform Role:** CAN-RIDE facilitates matching, fare quoting, bidding, route tracking, payment handling, and customer support.

---

### 2. User Accounts & Eligibility

- **Age & Eligibility:** You must be at least 18 years of age (or the age of majority in your province) to create an account and book rides.
- **Accuracy of Information:** You agree to maintain accurate, truthful, and up-to-date account information, including your legal name, verified mobile phone number, and payment details.
- **Security:** You are responsible for safeguarding your login credentials and one-time verification codes. You must immediately notify CAN-RIDE of any unauthorized account activity.

---

### 3. Tender-Based Bidding & Pricing Transparency

- **Tender Marketplace:** Passengers initiate a ride tender by submitting pickup location, drop-off location, schedule, and requested vehicle class. Available Drivers in the zone submit binding offers.
- **Transparent Selection:** Each offer displays the vehicle class, actual vehicle photo, driver hospitality rating, and total fare. Passengers choose the offer that best meets their preferences.
- **Server-Authoritative Pricing:** All fares shown in the app and website are server-authoritative. The accepted bid price is the final base price for the trip, plus applicable Canadian taxes (GST/HST/PST) itemized before payment.
- **No Surge Multipliers:** Fares are set directly by driver competition, not arbitrary surge pricing meters.

---

### 4. Payments, Authorizations & Receipts

- **Payment Processing:** Payment is processed securely through PCI-DSS Level 1 certified payment gateways. By booking an offer, you authorize CAN-RIDE to capture the total fare on your payment method.
- **When You Pay:** No charge is made while you review bids. Payment authorization or capture occurs when you choose and confirm an offer.
- **Receipts:** An electronic itemized receipt is generated upon trip completion and emailed to your registered address or stored in your trip history.
- **Cash Payments Prohibited:** Cash payments outside the platform for app-booked rides are strictly prohibited and violate this Agreement.

---

### 5. Cancellations, Flight Tracking & Waiting Time

- **Free Cancellation Window:** Each offer specifies the applicable free cancellation window prior to pickup time.
- **Late Cancellation Fees:** Cancellations after the free cancellation window has elapsed, or passenger no-shows, may incur a cancellation fee as displayed at the time of booking.
- **Airport Arrivals & Flight Tracking:** For airport pickups, providing a valid flight number enables automatic flight tracking. Complimentary waiting time (typically 45–60 minutes after actual landing) is included in the fare.
- **City Curb Waiting:** City pickups include complimentary waiting time (typically 10–15 minutes). Additional waiting time requested by the passenger may be billed at the standard rate indicated on the offer.

---

### 6. Passenger & Driver Code of Conduct

All users of the CAN-RIDE platform agree to maintain professional courtesy, safety, and mutual respect.

- **Zero Tolerance Policy:** Discrimination, harassment, threatening conduct, violence, carrying unauthorized hazardous materials, or damaging vehicles is strictly forbidden and results in immediate permanent account termination.
- **Compliance with Laws:** Drivers and passengers must comply with all applicable Canadian federal, provincial, and municipal transportation regulations, including seatbelt usage, child restraint laws, and traffic safety rules.
- **Ratings & Hospitality Score:** Travelers rate drivers on greeting, vehicle cleanliness, luggage assistance, and driving comfort. Disparaging, fraudulent, or retaliatory reviews are reviewed by ops and removed.

---

### 7. Limitation of Liability

To the maximum extent permitted by applicable law:
- CAN-RIDE is not liable for indirect, incidental, special, exemplary, punitive, or consequential damages, including lost profits, lost data, personal injury, or property damage related to or arising out of the transportation services provided by Drivers.
- Total platform liability for any claim arising out of this Agreement or your use of the marketplace is limited to the total amount paid by you for the specific ride giving rise to the claim.

---

### 8. Governing Law & Dispute Resolution

This Agreement is governed by and construed in accordance with the laws of the Province of Ontario and the federal laws of Canada applicable therein.

- **Informal Resolution:** Before initiating formal proceedings, you agree to contact CAN-RIDE Support at support@can-go.ca to attempt informal resolution in good faith.
- **Arbitration & Courts:** Any dispute that cannot be resolved informally shall be submitted to binding arbitration in Toronto, Ontario, or the competent courts of the Province of Ontario.

---

### 9. Modifications & Contact

CAN-RIDE reserves the right to update this Agreement periodically. Continued use of the platform following notification of modifications constitutes your acceptance of the updated terms.

- **Support & Inquiries:** [support@can-go.ca](mailto:support@can-go.ca)
- **Legal & Compliance:** [legal@can-go.ca](mailto:legal@can-go.ca)
- **Partner Inquiries:** [partner@can-go.ca](mailto:partner@can-go.ca)`;

export default function Page() {
  return (
    <CmsPageView
      slug="terms"
      kicker="Legal"
      fallbackTitle="Service Agreement"
      fallbackBody={TERMS_SERVICE_MD}
    />
  );
}

