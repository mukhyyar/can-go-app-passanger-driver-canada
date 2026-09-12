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
    bodyMd: `CAN-RIDE is a **marketplace**: passengers request a transfer, nearby drivers send offers, and you choose an offer before paying. CAN-RIDE is not a taxi company and does not employ the drivers who bid.

## Prices

Prices shown in the app and on the web are **server-authoritative**. The fare you accept is the fare you pay, plus taxes shown at checkout. Promotions apply only when the code validates at booking.

## Your contract

When you accept an offer you contract with that driver (or their carrier) for the trip. CAN-RIDE provides the booking, payment, tracking, and support tools.

## Cancellations and waiting

Cancellation and included waiting time are shown **before** you confirm an offer. Flight tracking applies when you add a flight number. Extra waiting may be billed as described on the offer.

## Price match

If you find a similar offer on another site at a lower price, you may claim a refund of the difference after the trip, subject to this agreement and the conditions published on the FAQ.

## Acceptable use

Do not create fake accounts, manipulate bids, or ask drivers to settle off-platform. We may suspend accounts that break these rules.

## Changes

We may update this agreement. The version on this page is the one that applies to new bookings. Replace this copy with counsel-approved text before production if your counsel so requires.`,
  },
  {
    slug: 'privacy',
    kind: 'legal',
    title: 'Privacy Policy',
    sortOrder: 20,
    bodyMd: `CAN-RIDE collects account details (name, email, phone), trip locations, and ride history to operate the marketplace. Driver KYC documents are stored privately and reviewed by ops. We do not sell personal data.

## What we use

- Identity and contact so you can sign in and receive trip updates
- Pickup and drop-off coordinates to quote, match bids, and track the ride
- Payment tokens via the payment provider — we do not store full card numbers
- Device and session data to keep accounts secure

## Sharing

We share what a driver needs to complete an accepted trip (name, pickup, flight, signage). Payment processors receive what they need to charge or refund. We disclose information when the law requires it.

## Retention

We keep ride and payment records as required for tax, dispute, and safety. You may ask support to export or correct your account data.

## Contact

Privacy questions: [support@can-go.ca](mailto:support@can-go.ca). This page is editable by Content Managers in Admin.`,
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
