import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'theme.dart';
import 'widgets.dart';

/// Reusable legal document viewer for CAN-RIDE apps.
/// Supports both 'privacy' and 'terms' with instant tab switching,
/// clean markdown-like typography, and offline fallbacks.
class GtLegalDocumentView extends StatefulWidget {
  const GtLegalDocumentView({
    super.key,
    this.initialSlug = 'privacy',
    this.fetchDocument,
    this.onSlugChanged,
    this.onContactSupport,
  });

  final String initialSlug;
  final Future<Map<String, dynamic>?> Function(String slug)? fetchDocument;
  final ValueChanged<String>? onSlugChanged;
  final VoidCallback? onContactSupport;

  @override
  State<GtLegalDocumentView> createState() => _GtLegalDocumentViewState();
}

class _GtLegalDocumentViewState extends State<GtLegalDocumentView> {
  late String _currentSlug;
  bool _loading = true;
  String? _title;
  String? _bodyMd;
  String? _updatedAt;

  static const String fallbackPrivacyMd = '''*Last updated: March 2026*

At **CAN-RIDE**, we respect your privacy and are committed to protecting your personal information. This Privacy Policy describes how CAN-RIDE collects, uses, discloses, and protects your personal data in compliance with the Canadian Personal Information Protection and Electronic Documents Act (PIPEDA) and applicable provincial privacy legislation.

---

### 1. Information We Collect

We collect only the personal information necessary to deliver marketplace transfer services and keep accounts secure.

- **Account Information:** Full name, email address, mobile phone number, profile photo, and password credentials.
- **Trip & Location Data:** Pickup address, drop-off destination, flight numbers, scheduled dates/times, and GPS geolocation data when the app is active.
- **Payment Information:** Payment methods and billing information. Full payment card details are tokenized and processed directly by our PCI-DSS certified payment processors; CAN-RIDE does not store full credit card numbers.
- **Driver & Carrier Partner Information:** Driver's licence, vehicle registration, commercial or rideshare insurance certificates, vehicle inspection reports, and background verification records.
- **Real-Time Telematics:** Live GPS coordinates and heading during active trips to dispatch and track rides.

---

### 2. How We Use Your Information

- Connect passengers with nearby licensed drivers through our competitive tender system.
- Process ride reservations, authorizations, payments, and receipts.
- Provide live vehicle tracking, estimated arrival times, and in-trip communication.
- Verify driver identity, vehicle safety, licensing, and regulatory compliance.
- Detect, investigate, and prevent fraudulent transactions, unauthorized account access, and safety incidents.
- Comply with Canadian legal, tax, accounting, and reporting obligations.

---

### 3. Sharing of Your Information

CAN-RIDE does **not** sell, rent, or trade your personal data. We disclose personal information only in the following limited circumstances:

- **Between Passenger and Driver:** When a ride is booked, we share the passenger's first name, pickup location, drop-off location, flight details, and in-trip chat with the accepted driver. Drivers' verified names, vehicle photos, vehicle details, hospitality scores, and live GPS locations are shared with the passenger.
- **Service Providers & Processors:** Trusted third-party vendors who assist with SMS verification, push notifications, payment processing (e.g. Stripe), cloud hosting, and mapping APIs under strict confidentiality agreements.
- **Safety & Legal Disclosures:** When required by Canadian law, subpoena, court order, or in emergency situations to protect physical safety.

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

To exercise any of these rights, email privacy@can-go.ca or submit a request through the CAN-RIDE app.

---

### 6. Contact Information

If you have questions, concerns, or requests regarding this Privacy Policy or our privacy practices:
- **Privacy Officer:** privacy@can-go.ca
- **General Support:** support@can-go.ca
- **Mailing Address:** CAN-RIDE Privacy Office, Toronto, Ontario, Canada''';

  static const String fallbackTermsMd = '''*Last updated: March 2026*

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

- **Support & Inquiries:** support@can-go.ca
- **Legal & Compliance:** legal@can-go.ca
- **Partner Inquiries:** partner@can-go.ca''';

  @override
  void initState() {
    super.initState();
    _currentSlug = widget.initialSlug == 'terms' ? 'terms' : 'privacy';
    _loadDocument(_currentSlug);
  }

  @override
  void didUpdateWidget(covariant GtLegalDocumentView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialSlug != widget.initialSlug &&
        widget.initialSlug != _currentSlug) {
      _selectSlug(widget.initialSlug);
    }
  }

  Future<void> _loadDocument(String slug) async {
    setState(() => _loading = true);
    if (widget.fetchDocument != null) {
      try {
        final data = await widget.fetchDocument!(slug);
        if (mounted && data != null) {
          setState(() {
            _title = data['title']?.toString();
            _bodyMd = data['bodyMd']?.toString();
            _updatedAt = data['updatedAt']?.toString();
            _loading = false;
          });
          return;
        }
      } catch (_) {
        // Fall back to built-in offline document.
      }
    }

    if (!mounted) return;
    setState(() {
      _title = slug == 'terms' ? 'Service Agreement' : 'Privacy Policy';
      _bodyMd = slug == 'terms' ? fallbackTermsMd : fallbackPrivacyMd;
      _updatedAt = 'March 2026';
      _loading = false;
    });
  }

  void _selectSlug(String slug) {
    if (_currentSlug == slug) return;
    setState(() {
      _currentSlug = slug;
    });
    widget.onSlugChanged?.call(slug);
    _loadDocument(slug);
  }

  void _copyToClipboard(BuildContext context, String text, String label) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$label copied to clipboard ($text)'),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isPrivacy = _currentSlug == 'privacy';
    final currentTitle = _title ?? (isPrivacy ? 'Privacy Policy' : 'Service Agreement');
    final rawBody = _bodyMd ?? (isPrivacy ? fallbackPrivacyMd : fallbackTermsMd);

    return Column(
      children: [
        // Top Segmented Switcher
        Container(
          color: GtColors.white,
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Container(
            decoration: BoxDecoration(
              color: GtColors.bgGrey,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: GtColors.border),
            ),
            padding: const EdgeInsets.all(4),
            child: Row(
              children: [
                Expanded(
                  child: _SegmentButton(
                    label: 'Privacy Policy',
                    icon: Icons.shield_outlined,
                    selected: isPrivacy,
                    onTap: () => _selectSlug('privacy'),
                  ),
                ),
                Expanded(
                  child: _SegmentButton(
                    label: 'Terms of Service',
                    icon: Icons.gavel_outlined,
                    selected: !isPrivacy,
                    onTap: () => _selectSlug('terms'),
                  ),
                ),
              ],
            ),
          ),
        ),
        const Divider(height: 1, color: GtColors.border),

        // Scrollable Document Content
        Expanded(
          child: RefreshIndicator(
            color: GtColors.brand,
            onRefresh: () => _loadDocument(_currentSlug),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
              children: [
                // Header Card
                GtCard(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: GtColors.soft,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          isPrivacy ? Icons.shield_outlined : Icons.description_outlined,
                          color: GtColors.brand,
                          size: 26,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              currentTitle,
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                                color: GtColors.text,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              isPrivacy
                                  ? 'Canadian PIPEDA Compliant · Marketplace Transfers'
                                  : 'Tender Marketplace · Server-Authoritative Fares',
                              style: const TextStyle(
                                fontSize: 12,
                                color: GtColors.textSecondary,
                              ),
                            ),
                            if (_updatedAt != null) ...[
                              const SizedBox(height: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: GtColors.bgGrey,
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: GtColors.border),
                                ),
                                child: Text(
                                  'Effective: ${_updatedAt!}',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w500,
                                    color: GtColors.textSecondary,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                if (_loading)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(40),
                      child: CircularProgressIndicator(),
                    ),
                  )
                else
                  _LegalMarkdownBody(
                    markdown: rawBody,
                    onEmailTap: (email) => _copyToClipboard(context, email, 'Email'),
                  ),

                const SizedBox(height: 24),

                // Contact Support Card
                GtCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Questions or privacy requests?',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: GtColors.text,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Our legal and operations teams are ready to help with compliance inquiries, data requests, and marketplace questions.',
                        style: TextStyle(
                          fontSize: 13,
                          color: GtColors.textSecondary,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () {
                                if (widget.onContactSupport != null) {
                                  widget.onContactSupport!();
                                } else {
                                  _copyToClipboard(
                                    context,
                                    'support@can-go.ca',
                                    'Support email',
                                  );
                                }
                              },
                              icon: const Icon(Icons.email_outlined, size: 16),
                              label: const Text('support@can-go.ca'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: GtColors.text,
                                side: const BorderSide(color: GtColors.border),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                textStyle: const TextStyle(fontSize: 12),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () {
                                _copyToClipboard(
                                  context,
                                  'privacy@can-go.ca',
                                  'Privacy email',
                                );
                              },
                              icon: const Icon(Icons.shield_outlined, size: 16),
                              label: const Text('privacy@can-go.ca'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: GtColors.text,
                                side: const BorderSide(color: GtColors.border),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                textStyle: const TextStyle(fontSize: 12),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _SegmentButton extends StatelessWidget {
  const _SegmentButton({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 8),
        decoration: BoxDecoration(
          color: selected ? GtColors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.06),
                    blurRadius: 4,
                    offset: const Offset(0, 1),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 16,
              color: selected ? GtColors.brand : GtColors.textSecondary,
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  color: selected ? GtColors.brand : GtColors.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Lightweight renderer for structured legal markdown
class _LegalMarkdownBody extends StatelessWidget {
  const _LegalMarkdownBody({
    required this.markdown,
    required this.onEmailTap,
  });

  final String markdown;
  final ValueChanged<String> onEmailTap;

  @override
  Widget build(BuildContext context) {
    final lines = markdown.split('\n');
    final widgets = <Widget>[];

    for (var i = 0; i < lines.length; i++) {
      final line = lines[i].trimRight();
      final trimmed = line.trim();

      if (trimmed.isEmpty) {
        widgets.add(const SizedBox(height: 6));
      } else if (trimmed == '---') {
        widgets.add(
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Divider(color: GtColors.border, height: 1),
          ),
        );
      } else if (trimmed.startsWith('### ')) {
        final title = trimmed.substring(4).replaceAll('**', '');
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(top: 14, bottom: 6),
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: GtColors.text,
              ),
            ),
          ),
        );
      } else if (trimmed.startsWith('## ')) {
        final title = trimmed.substring(3).replaceAll('**', '');
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(top: 16, bottom: 8),
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: GtColors.text,
              ),
            ),
          ),
        );
      } else if (trimmed.startsWith('# ')) {
        final title = trimmed.substring(2).replaceAll('**', '');
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(top: 18, bottom: 10),
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: GtColors.text,
              ),
            ),
          ),
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        final bulletText = trimmed.substring(2);
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  margin: const EdgeInsets.only(top: 7, right: 8),
                  width: 5,
                  height: 5,
                  decoration: const BoxDecoration(
                    color: GtColors.brand,
                    shape: BoxShape.circle,
                  ),
                ),
                Expanded(
                  child: _RichParagraph(
                    text: bulletText,
                    onEmailTap: onEmailTap,
                  ),
                ),
              ],
            ),
          ),
        );
      } else {
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: _RichParagraph(
              text: trimmed,
              onEmailTap: onEmailTap,
            ),
          ),
        );
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: widgets,
    );
  }
}

class _RichParagraph extends StatelessWidget {
  const _RichParagraph({
    required this.text,
    required this.onEmailTap,
  });

  final String text;
  final ValueChanged<String> onEmailTap;

  @override
  Widget build(BuildContext context) {
    // Process markdown formatting: **bold**, [link](url), and emails
    final spans = <InlineSpan>[];
    final regex = RegExp(r'(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})');
    var lastMatchEnd = 0;

    for (final match in regex.allMatches(text)) {
      if (match.start > lastMatchEnd) {
        spans.add(
          TextSpan(text: text.substring(lastMatchEnd, match.start)),
        );
      }

      final matchedStr = match.group(0)!;
      if (matchedStr.startsWith('**') && matchedStr.endsWith('**')) {
        spans.add(
          TextSpan(
            text: matchedStr.substring(2, matchedStr.length - 2),
            style: const TextStyle(fontWeight: FontWeight.w700, color: GtColors.text),
          ),
        );
      } else if (matchedStr.startsWith('[') && matchedStr.contains('](')) {
        final labelMatch = RegExp(r'\[([^\]]+)\]').firstMatch(matchedStr);
        final label = labelMatch != null ? labelMatch.group(1)! : matchedStr;
        spans.add(
          TextSpan(
            text: label,
            style: const TextStyle(
              color: GtColors.brand,
              fontWeight: FontWeight.w600,
              decoration: TextDecoration.underline,
            ),
          ),
        );
      } else if (matchedStr.contains('@')) {
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            child: GestureDetector(
              onTap: () => onEmailTap(matchedStr),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                  color: GtColors.soft,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  matchedStr,
                  style: const TextStyle(
                    fontSize: 12,
                    color: GtColors.brand,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        );
      }

      lastMatchEnd = match.end;
    }

    if (lastMatchEnd < text.length) {
      spans.add(TextSpan(text: text.substring(lastMatchEnd)));
    }

    return Text.rich(
      TextSpan(
        children: spans,
        style: const TextStyle(
          fontSize: 13.5,
          height: 1.5,
          color: GtColors.text,
        ),
      ),
    );
  }
}
