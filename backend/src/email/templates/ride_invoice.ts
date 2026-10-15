import { layout, escapeHtml } from './layout';

export interface RideInvoiceData {
  rideId: string;
  rideCode: string;
  passengerName: string;
  passengerEmail: string;
  passengerPhone?: string;
  driverName: string;
  vehicleName?: string;
  vehiclePlate?: string;
  vehicleClass?: string;
  vehicleColor?: string;
  vehicleYear?: number | null;
  fromLabel: string;
  toLabel: string;
  completedAtFormatted: string;
  currency: string;
  rideFare: string;
  marketplaceFee: string;
  taxes?: string;
  tipAmount?: string;
  totalCharged: string;
  paymentMethod: string;
  paymentStatus: string;
  transactionRef?: string;
  invoiceUrl?: string;
}

export function renderRideInvoice(
  data: RideInvoiceData,
  assetBaseUrl: string,
) {
  const code = escapeHtml(data.rideCode);
  const passengerName = escapeHtml(data.passengerName);
  const passengerEmail = escapeHtml(data.passengerEmail);
  const passengerPhone = escapeHtml(data.passengerPhone || '');
  const driverName = escapeHtml(data.driverName);
  const vehicleName = escapeHtml(data.vehicleName || '');
  const vehiclePlate = escapeHtml(data.vehiclePlate || '');
  const vehicleClass = escapeHtml(data.vehicleClass || '');
  const fromLabel = escapeHtml(data.fromLabel);
  const toLabel = escapeHtml(data.toLabel);
  const completedAt = escapeHtml(data.completedAtFormatted);
  const currency = escapeHtml(data.currency || 'CAD');
  const fare = escapeHtml(data.rideFare);
  const fee = escapeHtml(data.marketplaceFee);
  const taxes = escapeHtml(data.taxes || '0.00');
  const tip = escapeHtml(data.tipAmount || '0.00');
  const total = escapeHtml(data.totalCharged);
  const paymentMethod = escapeHtml(data.paymentMethod || 'Credit Card');
  const paymentStatus = escapeHtml(data.paymentStatus || 'SUCCEEDED');
  const txRef = escapeHtml(data.transactionRef || '');
  const invoiceUrl = data.invoiceUrl ? escapeHtml(data.invoiceUrl) : '';

  const subject = `Your CAN-RIDE Tax Invoice - #${code}`;

  const vehicleDetails = [
    vehicleName,
    vehicleClass,
    data.vehicleYear ? String(data.vehicleYear) : '',
    vehiclePlate ? `Plate: ${vehiclePlate}` : '',
  ].filter(Boolean).join(' • ');

  const html = layout(
    `
    <div style="border-bottom: 2px solid #E50000; padding-bottom: 16px; margin-bottom: 24px;">
      <h2 style="margin: 0 0 6px 0; color: #111827; font-size: 24px;">Official Ride Invoice</h2>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">
        Invoice #: <strong>CR-${code}</strong> &bull; Completed: ${completedAt}
      </p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; font-size: 14px;">
      <tr>
        <td width="50%" valign="top" style="padding-right: 12px;">
          <h4 style="margin: 0 0 6px 0; color: #374151; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Billed To (Passenger)</h4>
          <p style="margin: 0; font-weight: 600; color: #111827;">${passengerName || 'Passenger'}</p>
          <p style="margin: 2px 0 0 0; color: #4b5563;">${passengerEmail}</p>
          ${passengerPhone ? `<p style="margin: 2px 0 0 0; color: #4b5563;">${passengerPhone}</p>` : ''}
        </td>
        <td width="50%" valign="top" style="padding-left: 12px;">
          <h4 style="margin: 0 0 6px 0; color: #374151; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Driver &amp; Vehicle</h4>
          <p style="margin: 0; font-weight: 600; color: #111827;">${driverName}</p>
          ${vehicleDetails ? `<p style="margin: 2px 0 0 0; color: #4b5563;">${vehicleDetails}</p>` : ''}
        </td>
      </tr>
    </table>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <h4 style="margin: 0 0 10px 0; color: #374151; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Trip Route</h4>
      <div style="font-size: 14px;">
        <p style="margin: 0 0 6px 0;"><span style="color: #059669; font-weight: 700;">&bull; PICKUP:</span> ${fromLabel}</p>
        <p style="margin: 0;"><span style="color: #dc2626; font-weight: 700;">&bull; DROP-OFF:</span> ${toLabel}</p>
      </div>
    </div>

    <h4 style="margin: 0 0 10px 0; color: #374151; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">Payment Breakdown (${currency})</h4>
    <table class="receipt-table" width="100%" cellpadding="10" cellspacing="0" border="1" style="border-collapse: collapse; border-color: #e5e7eb; margin-bottom: 20px; font-size: 14px;">
      <tr style="background-color: #f9fafb;">
        <th align="left" style="padding: 10px; color: #374151;">Description</th>
        <th align="right" style="padding: 10px; color: #374151;">Amount (${currency})</th>
      </tr>
      <tr>
        <td style="padding: 10px; color: #111827;">Ride Fare</td>
        <td align="right" style="padding: 10px; color: #111827; font-weight: 500;">CA$${fare}</td>
      </tr>
      <tr>
        <td style="padding: 10px; color: #111827;">
          Marketplace Fee
          <div style="font-size: 12px; color: #6b7280;">CAN-RIDE platform technology &amp; service charge</div>
        </td>
        <td align="right" style="padding: 10px; color: #111827; font-weight: 500;">CA$${fee}</td>
      </tr>
      ${parseFloat(taxes) > 0 ? `
      <tr>
        <td style="padding: 10px; color: #111827;">Applicable Taxes (GST/HST)</td>
        <td align="right" style="padding: 10px; color: #111827; font-weight: 500;">CA$${taxes}</td>
      </tr>` : ''}
      ${parseFloat(tip) > 0 ? `
      <tr>
        <td style="padding: 10px; color: #111827;">
          Driver Tip
          <div style="font-size: 12px; color: #6b7280;">100% credited directly to driver</div>
        </td>
        <td align="right" style="padding: 10px; color: #111827; font-weight: 500;">CA$${tip}</td>
      </tr>` : ''}
      <tr style="background-color: #f9fafb; font-size: 16px;">
        <td style="padding: 14px 10px; font-weight: 700; color: #111827;">Total Customer Bill</td>
        <td align="right" style="padding: 14px 10px; font-weight: 700; color: #111827;">CA$${total}</td>
      </tr>
    </table>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px; font-size: 13px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <strong>Payment Method:</strong> ${paymentMethod}<br/>
            <strong>Payment Status:</strong> <span style="color: #059669; font-weight: 600;">${paymentStatus}</span>
            ${txRef ? `<br/><span style="color: #64748b; font-size: 11px;">Ref: ${txRef}</span>` : ''}
          </td>
          <td align="right" valign="middle">
            <span style="display: inline-block; background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 6px 14px; border-radius: 9999px; font-weight: 700; font-size: 12px;">PAID IN FULL</span>
          </td>
        </tr>
      </table>
    </div>

    ${invoiceUrl ? `
    <div style="text-align: center; margin: 24px 0 12px 0;">
      <a href="${invoiceUrl}" class="btn" style="display: inline-block; background: #111827; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 14px;">
        View / Print Official Invoice (PDF)
      </a>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 8px;">Opens a secure, printable tax invoice in your browser.</p>
    </div>` : ''}
    `,
    assetBaseUrl,
  );

  return { subject, html };
}

/**
 * Generates standalone printable HTML for direct browser viewing / printing to PDF.
 */
export function renderPrintableInvoiceHtml(
  data: RideInvoiceData,
  assetBaseUrl: string,
): string {
  const code = escapeHtml(data.rideCode);
  const passengerName = escapeHtml(data.passengerName);
  const passengerEmail = escapeHtml(data.passengerEmail);
  const passengerPhone = escapeHtml(data.passengerPhone || '');
  const driverName = escapeHtml(data.driverName);
  const vehicleName = escapeHtml(data.vehicleName || '');
  const vehiclePlate = escapeHtml(data.vehiclePlate || '');
  const vehicleClass = escapeHtml(data.vehicleClass || '');
  const fromLabel = escapeHtml(data.fromLabel);
  const toLabel = escapeHtml(data.toLabel);
  const completedAt = escapeHtml(data.completedAtFormatted);
  const currency = escapeHtml(data.currency || 'CAD');
  const fare = escapeHtml(data.rideFare);
  const fee = escapeHtml(data.marketplaceFee);
  const taxes = escapeHtml(data.taxes || '0.00');
  const tip = escapeHtml(data.tipAmount || '0.00');
  const total = escapeHtml(data.totalCharged);
  const paymentMethod = escapeHtml(data.paymentMethod || 'Credit Card');
  const paymentStatus = escapeHtml(data.paymentStatus || 'SUCCEEDED');
  const txRef = escapeHtml(data.transactionRef || '');
  const logoUrl = `${assetBaseUrl}/logo.png`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>CAN-RIDE Official Invoice - CR-${code}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800;900&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 15mm; }
    body {
      font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 0;
      padding: 30px;
      background: #f8fafc;
      color: #0f172a;
    }
    .invoice-card {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      border: 1px solid #e2e8f0;
    }
    .header-table { width: 100%; border-bottom: 3px solid #E50000; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { height: 48px; }
    .invoice-title { font-family: 'Montserrat', sans-serif; font-size: 26px; font-weight: 900; margin: 0; color: #111827; }
    .meta-text { color: #64748b; font-size: 13px; margin-top: 4px; }
    .section-title { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .breakdown-table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 24px; font-size: 15px; }
    .breakdown-table th { background: #f1f5f9; padding: 12px 14px; text-align: left; font-size: 13px; font-weight: 700; color: #334155; border-bottom: 1px solid #cbd5e1; }
    .breakdown-table td { padding: 14px; border-bottom: 1px solid #e2e8f0; }
    .total-row td { background: #f8fafc; font-size: 18px; font-weight: 700; border-top: 2px solid #0f172a; color: #0f172a; }
    .print-btn {
      background: #E50000; color: #ffffff; border: none; padding: 12px 24px; font-size: 14px; font-weight: 700; border-radius: 8px; cursor: pointer; margin-bottom: 24px;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .invoice-card { box-shadow: none; border: none; padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="no-print" style="text-align: right;">
      <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    </div>
    <table class="header-table" width="100%">
      <tr>
        <td>
          <img src="${logoUrl}" alt="CAN-RIDE" class="logo" />
          <div class="meta-text">CAN-RIDE Canada &bull; support@can-rides.ca</div>
        </td>
        <td align="right">
          <h1 class="invoice-title">TAX INVOICE</h1>
          <div class="meta-text">Invoice #: <strong>CR-${code}</strong></div>
          <div class="meta-text">Date: <strong>${completedAt}</strong></div>
        </td>
      </tr>
    </table>

    <table width="100%" style="margin-bottom: 24px;">
      <tr>
        <td width="50%" valign="top" style="padding-right: 15px;">
          <div class="section-title">Passenger (Billed To)</div>
          <div style="font-weight: 700; font-size: 16px;">${passengerName || 'Passenger'}</div>
          <div style="color: #475569; font-size: 14px; margin-top: 4px;">${passengerEmail}</div>
          ${passengerPhone ? `<div style="color: #475569; font-size: 14px;">${passengerPhone}</div>` : ''}
        </td>
        <td width="50%" valign="top" style="padding-left: 15px;">
          <div class="section-title">Assigned Driver &amp; Vehicle</div>
          <div style="font-weight: 700; font-size: 16px;">${driverName}</div>
          ${vehicleName ? `<div style="color: #475569; font-size: 14px; margin-top: 4px;">${vehicleName} (${vehicleClass || 'Standard'})</div>` : ''}
          ${vehiclePlate ? `<div style="color: #475569; font-size: 14px;">Plate: ${vehiclePlate}</div>` : ''}
        </td>
      </tr>
    </table>

    <div class="info-box">
      <div class="section-title">Trip Route</div>
      <div style="font-size: 14px; margin-bottom: 6px;"><strong style="color: #059669;">Pickup:</strong> ${fromLabel}</div>
      <div style="font-size: 14px;"><strong style="color: #dc2626;">Drop-off:</strong> ${toLabel}</div>
    </div>

    <div class="section-title">Payment Breakdown (${currency})</div>
    <table class="breakdown-table">
      <thead>
        <tr>
          <th>Item Description</th>
          <th style="text-align: right;">Amount (${currency})</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Ride Fare (Transportation Service)</td>
          <td align="right">CA$${fare}</td>
        </tr>
        <tr>
          <td>
            Marketplace Fee
            <div style="font-size: 12px; color: #64748b;">CAN-RIDE platform technology &amp; service charge</div>
          </td>
          <td align="right">CA$${fee}</td>
        </tr>
        ${parseFloat(taxes) > 0 ? `
        <tr>
          <td>Applicable Taxes (GST/HST)</td>
          <td align="right">CA$${taxes}</td>
        </tr>` : ''}
        ${parseFloat(tip) > 0 ? `
        <tr>
          <td>Driver Tip (100% credited to driver)</td>
          <td align="right">CA$${tip}</td>
        </tr>` : ''}
        <tr class="total-row">
          <td>Total Customer Bill</td>
          <td align="right">CA$${total}</td>
        </tr>
      </tbody>
    </table>

    <table width="100%" class="info-box" style="margin-top: 20px;">
      <tr>
        <td style="font-size: 13px;">
          <strong>Payment Method:</strong> ${paymentMethod} &bull; 
          <strong>Status:</strong> <span style="color: #059669; font-weight: 700;">${paymentStatus}</span>
          ${txRef ? `<br/><span style="color: #94a3b8; font-size: 12px;">Payment Ref: ${txRef}</span>` : ''}
        </td>
        <td align="right">
          <span style="background: #ecfdf5; border: 1px solid #10b981; color: #047857; padding: 6px 14px; border-radius: 9999px; font-weight: 700; font-size: 13px;">PAID IN FULL</span>
        </td>
      </tr>
    </table>

    <div style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
      Thank you for choosing CAN-RIDE Canada. For billing inquiries, please contact support@can-rides.ca.
    </div>
  </div>
</body>
</html>`;
}
