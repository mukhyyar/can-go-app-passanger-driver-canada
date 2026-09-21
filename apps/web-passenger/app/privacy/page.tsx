'use client';

import { CmsPageView } from '../../components/cms-page-view';

const PRIVACY_POLICY_MD = `*Last updated: March 2026*

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
- **Mailing Address:** CAN-RIDE Privacy Office, Toronto, Ontario, Canada`;

export default function Page() {
  return (
    <CmsPageView
      slug="privacy"
      kicker="Legal"
      fallbackTitle="Privacy Policy"
      fallbackBody={PRIVACY_POLICY_MD}
    />
  );
}

