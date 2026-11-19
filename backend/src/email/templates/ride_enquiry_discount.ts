import { layout, escapeHtml } from './layout';

export interface RideEnquiryDiscountData {
  rideId: string;
  rideCode: string;
  passengerName: string;
  pickupAt: string;
  expiresAt: string;
  fromLabel: string;
  toLabel: string;
  discountPct: number;
  actionUrl: string;
}

export function renderRideEnquiryDiscount(
  data: RideEnquiryDiscountData,
  assetBaseUrl: string,
) {
  const code = escapeHtml(data.rideCode);
  const name = escapeHtml(data.passengerName || 'Passenger');
  const pickupAt = escapeHtml(data.pickupAt);
  const expiresAt = escapeHtml(data.expiresAt);
  const from = escapeHtml(data.fromLabel);
  const to = escapeHtml(data.toLabel || 'As directed');
  const pct = Number(data.discountPct || 5);
  const actionUrl = escapeHtml(data.actionUrl);

  const subject = `Special ${pct}% Discount on Your CAN-RIDE Enquiry (${code})`;

  const html = layout(
    `
    <h2>Complete Your Booking &amp; Save ${pct}%!</h2>
    <p>Hello ${name},</p>
    <p>Your CAN-RIDE enquiry (<strong>${code}</strong>) will expire in less than 12 hours. Complete your booking before it expires and enjoy an automatic <strong>${pct}% discount</strong> on your ride!</p>

    <div class="alert-box" style="background:#dcfce7;border:1px solid #16a34a;border-radius:8px;padding:16px;margin:20px 0;color:#14532d;">
      <strong>Automatic ${pct}% Discount Active</strong><br>
      No promo code needed — the ${pct}% discount is automatically applied to all offers on this enquiry until <strong>${expiresAt}</strong>.
    </div>

    <div class="value-box" style="text-align: left; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; margin: 20px 0;">
      <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 16px; color: #111827;">Ride Enquiry Summary</h3>
      <p style="margin: 4px 0;"><strong>Enquiry Reference:</strong> ${code}</p>
      <p style="margin: 4px 0;"><strong>Pickup Location:</strong> ${from}</p>
      <p style="margin: 4px 0;"><strong>Destination:</strong> ${to}</p>
      <p style="margin: 4px 0;"><strong>Scheduled Pickup:</strong> ${pickupAt}</p>
      <p style="margin: 4px 0;"><strong>Discount Expires:</strong> ${expiresAt}</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${actionUrl}" class="btn" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:16px;">
        Complete Booking with ${pct}% Off
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280; text-align: center;">
      This discount expires automatically when your ride enquiry expires. Need help? Contact <a href="mailto:support@can-rides.ca" style="color: #E50000;">support@can-rides.ca</a>.
    </p>
    `,
    assetBaseUrl,
  );

  return { subject, html };
}
