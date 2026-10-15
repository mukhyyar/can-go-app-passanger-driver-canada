import { layout, escapeHtml } from './layout';

export interface RideDelayedAlertData {
  recipientRole: 'passenger' | 'driver';
  rideId: string;
  rideCode: string;
  recipientName: string;
  otherPartyName: string;
  pickupAt: string;
  fromLabel: string;
  toLabel: string;
  actionUrl: string;
}

export function renderRideDelayedAlert(
  data: RideDelayedAlertData,
  assetBaseUrl: string,
) {
  const code = escapeHtml(data.rideCode);
  const name = escapeHtml(data.recipientName || (data.recipientRole === 'passenger' ? 'Passenger' : 'Driver'));
  const other = escapeHtml(data.otherPartyName || (data.recipientRole === 'passenger' ? 'your driver' : 'your passenger'));
  const pickupAt = escapeHtml(data.pickupAt);
  const from = escapeHtml(data.fromLabel);
  const to = escapeHtml(data.toLabel);
  const actionUrl = escapeHtml(data.actionUrl);

  const isPassenger = data.recipientRole === 'passenger';
  const subject = isPassenger
    ? `Action Required: Your CAN-RIDE Trip is Delayed (${code})`
    : `Urgent Action Required: Trip Stalled or Delayed (${code})`;

  const messageBody = isPassenger
    ? `
      <h2>Is your trip delayed or not moving?</h2>
      <p>Hello ${name},</p>
      <p>We noticed that your scheduled CAN-RIDE trip (<strong>${code}</strong>) has not progressed as expected.</p>
      
      <div class="alert-box" style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin:20px 0;color:#92400e;">
        <strong>Why are you not moving or is there an issue?</strong><br>
        If your driver (${other}) has not arrived or the trip has stalled, you have full control over your ride.
      </div>

      <p>Please open the CAN-RIDE app to choose how to proceed:</p>
      <ul>
        <li><strong>Reschedule:</strong> Choose a new convenient pickup time.</li>
        <li><strong>Cancel & Refund:</strong> Cancel this booking directly in the app. A <strong>100% full refund</strong> will be automatically credited back to your original payment method.</li>
      </ul>
    `
    : `
      <h2>Trip Stalled / Progression Delayed</h2>
      <p>Hello ${name},</p>
      <p>Your accepted trip (<strong>${code}</strong>) with passenger ${other} has not progressed as scheduled.</p>

      <div class="alert-box" style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin:20px 0;color:#92400e;">
        <strong>Why are you not moving or having trouble?</strong><br>
        If you are experiencing unexpected vehicle issues, road delays, or cannot fulfill this trip, please take immediate action.
      </div>

      <p>Please open the CAN-RIDE driver app to update your status or cancel the trip so the passenger can be fully refunded.</p>
    `;

  const html = layout(
    `
    ${messageBody}

    <div class="value-box" style="text-align: left; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; margin: 20px 0;">
      <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 16px; color: #111827;">Trip Information</h3>
      <p style="margin: 4px 0;"><strong>Ride Reference:</strong> ${code}</p>
      <p style="margin: 4px 0;"><strong>Scheduled Pickup:</strong> ${pickupAt}</p>
      <p style="margin: 4px 0;"><strong>Pickup Location:</strong> ${from}</p>
      <p style="margin: 4px 0;"><strong>Destination:</strong> ${to}</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${actionUrl}" class="btn" style="display:inline-block;background:#E50000;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:16px;">
        ${isPassenger ? 'View Ride / Reschedule or Cancel' : 'Open Driver App'}
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280; text-align: center;">
      Need immediate assistance? Contact our 24/7 support team anytime at <a href="mailto:support@can-rides.ca" style="color: #E50000;">support@can-rides.ca</a>.
    </p>
    `,
    assetBaseUrl,
  );

  return { subject, html };
}
