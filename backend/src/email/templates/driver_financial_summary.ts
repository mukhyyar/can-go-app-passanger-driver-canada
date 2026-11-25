import { layout, escapeHtml } from './layout';

export interface DriverFinancialSummaryData {
  driverName: string;
  driverEmail: string;
  driverId: string;
  periodType: 'MONTHLY' | 'YEARLY';
  periodLabel: string; // e.g. "November 2026" or "Annual Tax Year 2026"
  dateRangeFormatted: string; // e.g. "November 1, 2026 – November 30, 2026"
  currency: string; // "CAD"
  
  // Trip counts
  completedTripsCount: number;
  
  // Financial breakdown formatted strings
  grossFareTotal: string; // e.g. "$1,250.00"
  platformCommissionTotal: string; // e.g. "$250.00"
  netFareTotal: string; // e.g. "$1,000.00"
  tipsTotal: string; // e.g. "$180.00"
  adjustmentsTotal: string; // e.g. "$20.00"
  netEarningsTotal: string; // e.g. "$1,200.00"
  
  // Payouts
  payoutsTotal: string; // e.g. "$1,150.00"
  payoutsCount: number;
}

export function renderDriverFinancialSummary(
  data: DriverFinancialSummaryData,
  assetBaseUrl: string,
) {
  const driverName = escapeHtml(data.driverName);
  const periodLabel = escapeHtml(data.periodLabel);
  const dateRange = escapeHtml(data.dateRangeFormatted);
  const currency = escapeHtml(data.currency || 'CAD');
  const tripsCount = data.completedTripsCount;
  const netEarnings = escapeHtml(data.netEarningsTotal);
  const grossFares = escapeHtml(data.grossFareTotal);
  const commission = escapeHtml(data.platformCommissionTotal);
  const netFares = escapeHtml(data.netFareTotal);
  const tips = escapeHtml(data.tipsTotal);
  const adjustments = escapeHtml(data.adjustmentsTotal);
  const payoutsTotal = escapeHtml(data.payoutsTotal);
  const payoutsCount = data.payoutsCount;

  const subject = `Your CAN-RIDE Financial Summary — ${periodLabel} (${currency})`;

  const content = `
    <div style="margin-bottom: 24px;">
      <span style="display: inline-block; background-color: #fee2e2; color: #b91c1c; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">
        ${data.periodType === 'MONTHLY' ? 'Monthly Statement' : 'Annual Tax Summary'}
      </span>
      <h2 style="margin: 12px 0 6px 0; color: #111827; font-size: 24px; font-weight: 800;">
        Financial Summary: ${periodLabel}
      </h2>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">
        ${dateRange}
      </p>
    </div>

    <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
      Hi <strong>${driverName}</strong>,<br>
      Here is your official CAN-RIDE financial statement for <strong>${periodLabel}</strong>.
    </p>

    <!-- Key Performance Highlights -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border-collapse: separate; border-spacing: 12px 0;">
      <tr>
        <td style="width: 50%; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 16px; text-align: center;">
          <div style="font-size: 13px; font-weight: 600; color: #065f46; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
            Total Net Earnings
          </div>
          <div style="font-size: 26px; font-weight: 800; color: #047857;">
            ${netEarnings}
          </div>
          <div style="font-size: 12px; color: #059669; margin-top: 2px;">
            ${currency}
          </div>
        </td>
        <td style="width: 50%; background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; text-align: center;">
          <div style="font-size: 13px; font-weight: 600; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
            Completed Trips
          </div>
          <div style="font-size: 26px; font-weight: 800; color: #1f2937;">
            ${tripsCount}
          </div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">
            Rides Finalized
          </div>
        </td>
      </tr>
    </table>

    <!-- Detailed Earnings Breakdown -->
    <h3 style="font-size: 17px; font-weight: 700; color: #111827; margin: 28px 0 12px 0; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px;">
      Earnings & Platform Fee Breakdown
    </h3>

    <table width="100%" cellpadding="10" cellspacing="0" style="border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="color: #4b5563; padding: 10px 0;">Gross Trip Fares (Billed to Passengers)</td>
        <td align="right" style="font-weight: 600; color: #111827; padding: 10px 0;">+${grossFares}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="color: #4b5563; padding: 10px 0;">Less: CAN-RIDE Platform Commission (20%)</td>
        <td align="right" style="font-weight: 600; color: #dc2626; padding: 10px 0;">-${commission}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
        <td style="color: #374151; font-weight: 600; padding: 10px 8px;">Net Ride Earnings Subtotal</td>
        <td align="right" style="font-weight: 700; color: #111827; padding: 10px 8px;">${netFares}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="color: #4b5563; padding: 10px 0;">Passenger Tips (100% Credited to Driver)</td>
        <td align="right" style="font-weight: 600; color: #059669; padding: 10px 0;">+${tips}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="color: #4b5563; padding: 10px 0;">Adjustments & Other Compensations</td>
        <td align="right" style="font-weight: 600; color: #4b5563; padding: 10px 0;">${adjustments}</td>
      </tr>
      <tr style="border-top: 2px solid #111827; border-bottom: 2px solid #111827; background-color: #f9fafb;">
        <td style="color: #111827; font-weight: 800; font-size: 15px; padding: 12px 8px;">Total Net Earnings (${currency})</td>
        <td align="right" style="color: #047857; font-weight: 800; font-size: 16px; padding: 12px 8px;">${netEarnings}</td>
      </tr>
    </table>

    <!-- Direct Bank Payouts Section -->
    <h3 style="font-size: 17px; font-weight: 700; color: #111827; margin: 28px 0 12px 0; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px;">
      Bank Direct Deposits (Stripe)
    </h3>
    <table width="100%" cellpadding="10" cellspacing="0" style="border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="color: #4b5563; padding: 10px 0;">Successful Bank Transfers</td>
        <td align="right" style="font-weight: 600; color: #111827; padding: 10px 0;">${payoutsCount} transfer${payoutsCount === 1 ? '' : 's'}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
        <td style="color: #111827; font-weight: 700; padding: 10px 8px;">Total Deposited to Bank (${currency})</td>
        <td align="right" style="font-weight: 700; color: #111827; padding: 10px 8px;">${payoutsTotal}</td>
      </tr>
    </table>

    <!-- Canadian Tax / CRA Guidance Notice -->
    <div style="background-color: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 16px; margin: 28px 0; font-size: 13px; line-height: 1.5; color: #854d0e;">
      <strong>Canada Revenue Agency (CRA) Notice:</strong><br>
      CAN-RIDE operates as a technology marketplace platform in Canada. Driver earnings are reported as gross independent contractor business receipts. 
      Please retain this statement for your tax filing records (CRA Form T2125 - <em>Statement of Business or Professional Activities</em>).
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">
      Need assistance with your financial summary? Reach out anytime to our Canadian driver support at <a href="mailto:support@can-rides.ca" style="color: #E50000; text-decoration: none;">support@can-rides.ca</a>.
    </p>
  `;

  const html = layout(content, assetBaseUrl);
  return { subject, html };
}
