import { layout, escapeHtml } from './layout';

export interface PostRideReviewData {
  rideId: string;
  rideCode: string;
  passengerName: string;
  driverName: string;
  fromLabel: string;
  toLabel: string;
  reviewUrl: string;
}

export function renderPostRideReview(
  data: PostRideReviewData,
  assetBaseUrl: string,
) {
  const code = escapeHtml(data.rideCode);
  const driverName = escapeHtml(data.driverName);
  const passengerName = escapeHtml(data.passengerName);
  const fromLabel = escapeHtml(data.fromLabel);
  const toLabel = escapeHtml(data.toLabel);
  const reviewUrl = escapeHtml(data.reviewUrl);

  const subject = `How was your ride with ${data.driverName}? - CAN-RIDE ${code}`;
  const html = layout(
    `
    <h2>Thank you for riding with CAN-RIDE!</h2>
    <p>Hi ${passengerName || 'there'},</p>
    <p>We hope you enjoyed your journey from <strong>${fromLabel}</strong> to <strong>${toLabel}</strong> with driver <strong>${driverName}</strong> (Ride <strong>#${code}</strong>).</p>

    <div class="value-box" style="text-align: center; margin: 24px 0; padding: 24px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
      <h3 style="margin-top: 0; color: #111827; font-size: 18px;">How was your experience?</h3>
      <p style="color: #4b5563; margin-bottom: 20px;">We'd love to hear your feedback! Would you choose CAN-RIDE for your next trip?</p>
      
      <a href="${reviewUrl}" class="btn" style="display: inline-block; background: #E50000; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-weight: 700; text-decoration: none; font-size: 16px;">
        Rate &amp; Review Your Ride
      </a>
      <p style="font-size: 13px; color: #9ca3af; margin-top: 12px; margin-bottom: 0;">Takes less than a minute. Your feedback helps us improve!</p>
    </div>

    <div style="background: #f8fafc; border-left: 4px solid #E50000; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
      <p style="margin: 0; font-weight: 600; color: #1e293b;">Enjoyed our service?</p>
      <p style="margin: 6px 0 0 0; color: #475569; font-size: 14px;">
        Please recommend CAN-RIDE to your friends, family, and colleagues! We are committed to providing reliable, safe, and fair rides across Canada.
      </p>
    </div>

    <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
      Thank you for choosing CAN-RIDE for your travel. We look forward to welcoming you on board again soon!
    </p>
    `,
    assetBaseUrl,
  );

  return { subject, html };
}
