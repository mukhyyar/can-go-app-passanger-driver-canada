export const CMS_KINDS = ['page', 'faq', 'legal', 'app'] as const;
export type CmsKind = (typeof CMS_KINDS)[number];

export type CmsSeed = {
  slug: string;
  kind: CmsKind;
  title: string;
  bodyMd: string;
  category?: string;
  sortOrder: number;
};

export const CMS_SEEDS: CmsSeed[] = [
  {
    slug: 'support',
    kind: 'page',
    title: 'Support',
    sortOrder: 10,
    bodyMd: `CAN-RIDE support helps with bookings, driver offers, payments, and account access. For a trip that is already booked, open **My trips**, keep the driver chat handy, and we will stay with you until you are at the curb.

## Contact

- **Passenger support:** [support@can-go.ca](mailto:support@can-go.ca)
- **Driver & partner desk:** [partner@can-go.ca](mailto:partner@can-go.ca)
- **Hours:** 24/7 for trips in progress. Billing and account mail is answered within one business day.

## Fastest way to get help

1. Open the ride from **My trips**.
2. Use in-ride chat with the driver for pickup, luggage, and waiting time.
3. Email support with your ride code (starts with **CG-RIDE-**) if you need a refund, receipt, or complaint.

We never ask for your password. CAN-RIDE staff will never ask you to pay a driver in cash outside the app.`,
  },
  {
    slug: 'faq',
    kind: 'page',
    title: 'Frequently asked questions',
    sortOrder: 20,
    bodyMd: `Answers about how CAN-RIDE works: tender-based pricing, when you pay, cancellations, flights, child seats, and price match. Open a question below. If you still need a person, write to [support@can-go.ca](mailto:support@can-go.ca).`,
  },
  {
    slug: 'agents',
    kind: 'page',
    title: 'For travel agents',
    sortOrder: 30,
    bodyMd: `Book airport and city transfers for your clients on the same marketplace they would use themselves: request the trip, compare driver offers, and pay the offer you select.

## What agents get

- Book on behalf of guests with pickup, flight number, and meet-and-greet signage.
- See the actual vehicle in each bid before you confirm.
- One receipt per trip for client invoicing.
- Dedicated partner email: [partner@can-go.ca](mailto:partner@can-go.ca).

## How to start

Use the passenger booking form today. Agent commissions, shared trip links, and multi-guest workspaces are rolling out — register interest at the partner desk and we will add your agency to the waitlist.

Include your IATA/CLIA number (if any), cities you book, and monthly transfer volume.`,
  },
  {
    slug: 'feedback',
    kind: 'page',
    title: 'Feedback',
    sortOrder: 40,
    bodyMd: `Tell us what to improve in booking, offers, the map, or hospitality. Product feedback goes to the CAN-RIDE team and shapes the next release.

## What to send

- What you tried to do
- What happened instead
- Ride code if it is about a trip (**CG-RIDE-…**)
- Screenshots or the city and vehicle class

Email **[support@can-go.ca](mailto:support@can-go.ca)** with the subject **Feedback**. We read every note. We cannot always reply individually, but we do ship the changes that keep coming up.

For a complaint about a completed trip, use Support and include the ride code so ops can open the case.`,
  },
  {
    slug: 'blog',
    kind: 'page',
    title: 'From the road',
    sortOrder: 50,
    bodyMd: `Guides on tender-based transfers, airport playbooks, and how hospitality scores work on CAN-RIDE. New articles publish here as the team writes them. Every post is editable from Admin → Content.`,
  },
  {
    slug: 'destinations',
    kind: 'page',
    title: 'Destinations',
    sortOrder: 60,
    bodyMd: `Book airport transfers, intercity rides, hourly chauffeur, and delivery in cities CAN-RIDE covers. Start with pickup and drop-off — nearby drivers bid, you pick the offer.

## Popular corridors

- Toronto Pearson (YYZ) ↔ downtown Toronto
- Vancouver International (YVR) ↔ downtown Vancouver
- Montréal-Trudeau (YUL) ↔ downtown Montréal
- Calgary International (YYC) ↔ downtown Calgary
- Dubai International (DXB) ↔ Downtown Dubai
- London Heathrow (LHR) ↔ Central London

Coverage grows with approved drivers. If your city is not listed yet, still send a request: drivers who operate that zone can bid.`,
  },
  {
    slug: 'drivers',
    kind: 'page',
    title: 'Drive with CAN-RIDE',
    sortOrder: 70,
    bodyMd: `You set the price. Passengers choose the offer that fits. CAN-RIDE is a marketplace, not a dispatch meter.

## How it works

1. Complete KYC and add your vehicle.
2. Set the operating zone you actually cover.
3. Bid on nearby requests with your fare and the car photo.
4. Get paid when the passenger accepts and the trip completes.

## Requirements

- Valid licence and insurance for the vehicle class
- Vehicle photos that match what the passenger will see
- Documents that ops can approve (licence, registration, insurance)

Download the CAN-RIDE Driver app to go online. Questions: [partner@can-go.ca](mailto:partner@can-go.ca).`,
  },
  {
    slug: 'business',
    kind: 'page',
    title: 'CAN-RIDE for business',
    sortOrder: 80,
    bodyMd: `Move staff and guests with the same marketplace model: request, compare driver offers, pay the selected trip. No surge surprise at the airport.

## Typical uses

- Airport meet-and-greet for visiting teams
- Hourly cars for a board day or site tour
- Intercity transfers between offices

## What finance gets

- One receipt per trip
- Vehicle class and hospitality score on the offer you accepted
- Support that can pull the ride audit if something goes wrong

Write to [partner@can-go.ca](mailto:partner@can-go.ca) with company name, cities, and expected monthly volume. We will set up a business contact — corporate accounts and invoicing follow.`,
  },
  {
    slug: 'terms',
    kind: 'legal',
    title: 'Service Agreement',
    sortOrder: 10,
    bodyMd: `*Last updated: March 2026*

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
- **Partner Inquiries:** [partner@can-go.ca](mailto:partner@can-go.ca)`,
  },
  {
    slug: 'privacy',
    kind: 'legal',
    title: 'Privacy Policy',
    sortOrder: 20,
    bodyMd: `*Last updated: March 2026*

At **CAN-RIDE**, we respect your privacy and are committed to protecting your personal information. This Privacy Policy describes how CAN-RIDE collects, uses, discloses, and protects your personal data in compliance with the Canadian *Personal Information Protection and Electronic Documents Act* (PIPEDA) and applicable provincial privacy legislation.

---

### 1. Information We Collect

We collect only the personal information necessary to deliver marketplace transfer services and keep accounts secure.

#### A. Passenger Information
- **Account Information:** Full name, email address, mobile phone number, profile photo, and password credentials.
- **Trip & Location Data:** Pickup address, drop-off destination, flight numbers, scheduled dates/times, and GPS geolocation data when the app is active.
- **Payment Information:** Payment methods and billing information. Full payment card details are tokenized and processed directly by our PCI-DSS certified payment processors; CAN-RIDE does not store full credit card numbers.
- **Communications:** In-app chat messages, ratings, feedback, and support inquiries.

#### B. Driver & Carrier Partner Information
- **Carrier Profile:** Legal name, operating business name, contact details, profile photo, and operating zones.
- **KYC & Compliance Documents:** Government-issued driver's licence, vehicle registration, commercial or rideshare insurance certificates, vehicle inspection reports, and background verification records.
- **Vehicle Details:** Make, model, year, colour, vehicle class, license plate, and interior/exterior vehicle photographs.
- **Financial Details:** Direct deposit/bank account details for payouts and earnings records.
- **Real-Time Telematics:** Live GPS coordinates and heading during active trips and when in "driving mode" to dispatch and track rides.

---

### 2. How We Use Your Information

We use personal information to:
- Connect passengers with nearby licensed drivers through our competitive tender system.
- Process ride reservations, authorizations, payments, and receipts.
- Provide live vehicle tracking, estimated arrival times, and in-trip communication.
- Verify driver identity, vehicle safety, licensing, and regulatory compliance.
- Detect, investigate, and prevent fraudulent transactions, unauthorized account access, and safety incidents.
- Improve our algorithms, marketplace reliability, and user interface.
- Comply with Canadian legal, tax, accounting, and reporting obligations.

---

### 3. Sharing of Your Information

CAN-RIDE does **not** sell, rent, or trade your personal data. We disclose personal information only in the following limited circumstances:

- **Between Passenger and Driver:** When a ride is booked, we share the passenger's first name, pickup location, drop-off location, flight details, and in-trip chat with the accepted driver. Drivers' verified names, vehicle photos, vehicle details, hospitality scores, and live GPS locations are shared with the passenger.
- **Service Providers & Processors:** Trusted third-party vendors who assist with SMS verification, push notifications, payment processing (e.g. Stripe), cloud hosting, and mapping APIs under strict confidentiality agreements.
- **Safety & Legal Disclosures:** When required by Canadian law, subpoena, court order, or in emergency situations to protect the physical safety of passengers, drivers, or the public.

---

### 4. Storage, Retention & Security

- **Data Security:** We implement robust administrative, technical, and physical safeguards—including SSL/TLS encryption in transit and AES encryption at rest—to safeguard your information from loss, theft, or unauthorized access.
- **KYC Document Privacy:** Driver verification documents are stored securely in restricted-access cloud storage and accessible solely to trained compliance personnel for document verification.
- **Data Retention:** We retain personal information for as long as your account remains active or as required by applicable tax, commercial, and transport record-keeping regulations.

---

### 5. Your Rights & Choices

Under Canadian privacy laws, you have the right to:
- Access the personal information CAN-RIDE holds about you.
- Request correction of inaccurate or incomplete personal records.
- Request deletion of your account and associated personal data (subject to legal retention requirements).
- Withdraw consent to marketing communications at any time.
- Manage location permissions directly within your device settings.

To exercise any of these rights, email **[privacy@can-go.ca](mailto:privacy@can-go.ca)** or submit a request through the CAN-RIDE app.

---

### 6. Updates to this Policy

We may modify this Privacy Policy from time to time to reflect regulatory updates or service enhancements. We will notify you of material changes via app notification or email.

---

### 7. Privacy Office Contact

If you have questions, concerns, or requests regarding this Privacy Policy or our privacy practices:

- **Privacy Officer:** [privacy@can-go.ca](mailto:privacy@can-go.ca)
- **General Support:** [support@can-go.ca](mailto:support@can-go.ca)
- **Mailing Address:** CAN-RIDE Privacy Office, Toronto, Ontario, Canada`,
  },
  {
    slug: 'faq-how-it-works',
    kind: 'faq',
    category: 'Booking',
    title: 'How does CAN-RIDE work?',
    sortOrder: 10,
    bodyMd: `Create a ride request with pickup, drop-off, time, and vehicle classes. Nearby drivers send offers with the car photo, hospitality score, and their price. You compare and book the one you like — then pay that offer. That is tender-based pricing, not a fixed meter.`,
  },
  {
    slug: 'faq-when-pay',
    kind: 'faq',
    category: 'Payments',
    title: 'When do I pay?',
    sortOrder: 20,
    bodyMd: `You pay only after you select an offer. There is no charge while you wait for bids. The amount you confirm is captured by the payment provider; cancellation rules are shown before you confirm.`,
  },
  {
    slug: 'faq-price-match',
    kind: 'faq',
    category: 'Payments',
    title: 'What is price match?',
    sortOrder: 30,
    bodyMd: `If you find a similar offer on another site at a lower price, you can claim a refund of the difference after the trip. The claim must match vehicle class, pickup window, and route, and is subject to the Service Agreement. Email support with the ride code and proof of the other offer.`,
  },
  {
    slug: 'faq-cancel',
    kind: 'faq',
    category: 'Booking',
    title: 'Can I cancel a booking?',
    sortOrder: 40,
    bodyMd: `Yes. Cancellation terms depend on timing and the selected offer. Free cancellation windows and fees are shown before you pay. Open the trip in **My trips** to cancel, or write to support with the ride code.`,
  },
  {
    slug: 'faq-flight-delay',
    kind: 'faq',
    category: 'During the trip',
    title: 'What if my flight is delayed?',
    sortOrder: 50,
    bodyMd: `Add your flight number when you book so the driver can track arrivals and wait within the included time. Included waiting is shown on the offer. If the delay is longer, message the driver in chat or contact support so we can extend or re-bid.`,
  },
  {
    slug: 'faq-child-seats',
    kind: 'faq',
    category: 'Booking',
    title: 'Are child seats available?',
    sortOrder: 60,
    bodyMd: `Yes. Request infant, child, or booster seats when you create the ride. Only drivers who can provide those seats should bid. Confirm the seat type in chat if you have a specific model requirement.`,
  },
  {
    slug: 'faq-waiting',
    kind: 'faq',
    category: 'During the trip',
    title: 'How much waiting time is included?',
    sortOrder: 70,
    bodyMd: `Airport pickups usually include a waiting window after landing (shown on the offer). City pickups include a shorter curb wait. Message the driver if you are late. Extra wait may be charged as described on the offer.`,
  },
  {
    slug: 'faq-vehicle',
    kind: 'faq',
    category: 'Booking',
    title: 'Will I see the actual car?',
    sortOrder: 80,
    bodyMd: `Yes. Every bid includes the vehicle the driver intends to send. If the car at pickup does not match, refuse the trip, photograph the vehicle, and contact support with the ride code before you travel.`,
  },
  {
    slug: 'faq-safety',
    kind: 'faq',
    category: 'Account',
    title: 'How does CAN-RIDE keep trips safe?',
    sortOrder: 90,
    bodyMd: `Drivers complete KYC and vehicle checks before they can bid. You can share live tracking from the trip page. In-app chat is logged. For an emergency, call local emergency services first, then notify support.`,
  },
  {
    slug: 'faq-account',
    kind: 'faq',
    category: 'Account',
    title: 'I cannot sign in. What should I do?',
    sortOrder: 100,
    bodyMd: `Use the same email you registered with. Request a new one-time code from the login screen. If the phone number changed, email [support@can-go.ca](mailto:support@can-go.ca) from the original address. We will never ask for your password.`,
  },
  {
    slug: 'blog-tender-marketplace',
    kind: 'app',
    category: 'blog',
    title: 'Why CAN-RIDE uses driver bids, not a meter',
    sortOrder: 10,
    bodyMd: `Most ride apps show one price from the platform. CAN-RIDE opens a **tender**: you publish the trip, drivers who can actually cover it send offers, and you pick.

That means you see the car, the hospitality score, and the fare **before** you pay. If one driver is expensive and another is right, you choose. If nobody can make your time, you are not stuck with a surge number on a screen — you wait for a real offer or adjust the request.

Price match still applies after the trip when another site had a similar offer cheaper, subject to the Service Agreement.`,
  },
  {
    slug: 'blog-airport-playbook',
    kind: 'app',
    category: 'blog',
    title: 'Airport playbook: flight number, signage, and waiting',
    sortOrder: 20,
    bodyMd: `Airport pickups go smoother when three fields are filled:

1. **Flight number** — the driver tracks delays and uses the included waiting window.
2. **Signage** — your name on a board at arrivals, not a hunt at the curb.
3. **Vehicle class** — Economy, Comfort, or Van so luggage actually fits.

Add a comment if you have a tight connection or a lot of bags. Drivers bid with that context. After you accept, keep chat open until you see the car.`,
  },
  {
    slug: 'blog-hospitality',
    kind: 'app',
    category: 'blog',
    title: 'Hospitality score: greeting, luggage, and the ride',
    sortOrder: 30,
    bodyMd: `Stars alone do not tell you if the driver helped with bags or met you at arrivals. CAN-RIDE asks travelers to rate **hospitality**: greeting, luggage help, and the ride itself.

That score sits on every bid next to the car photo. A cheaper offer with a weak hospitality record is still your choice — you can see it. After the trip, your rating is reviewed before it goes public when a comment is included.`,
  },
];
