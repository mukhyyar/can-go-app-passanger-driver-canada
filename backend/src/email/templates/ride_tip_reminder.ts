import { layout, escapeHtml } from './layout';

export interface RideTipReminderData {
  rideId: string;
  rideCode: string;
  passengerName: string;
  driverName: string;
  tipUrl: string;
}

export function renderRideTipReminder(
  data: RideTipReminderData,
  assetBaseUrl: string,
) {
  const code = escapeHtml(data.rideCode);
  const passengerName = escapeHtml(data.passengerName);
  const driverName = escapeHtml(data.driverName);
  const tipUrl = escapeHtml(data.tipUrl);

  const subject = `Did your driver provide excellent service? - CAN-RIDE #${code}`;
  const html = layout(
    `
    <h2>Thank you for choosing CAN-RIDE!</h2>
    <p>Hi ${passengerName || 'there'},</p>
    <p>We hope you had a comfortable and pleasant journey with <strong>${driverName}</strong> on ride <strong>#${code}</strong>.</p>

    <div class="value-box" style="text-align: center; margin: 24px 0; padding: 24px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
      <h3 style="margin-top: 0; color: #111827; font-size: 18px;">Did your driver provide excellent service?</h3>
      <p style="color: #4b5563; margin-bottom: 20px;">
        Show your appreciation by leaving a tip! Tipping is completely optional, but it's a great way to recognize your driver's efforts.
      </p>

      <a href="${tipUrl}" class="btn" style="display: inline-block; background: #E50000; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-weight: 700; text-decoration: none; font-size: 16px;">
        Tip Your Driver
      </a>
      <p style="font-size: 13px; color: #9ca3af; margin-top: 12px; margin-bottom: 0;">100% of your tip goes directly to your driver.</p>
    </div>

    <p style="color: #4b5563; font-size: 14px; text-align: center; margin-top: 20px;">
      Thank you for supporting our CAN-RIDE driver community!
    </p>
    `,
    assetBaseUrl,
  );

  return { subject, html };
}
