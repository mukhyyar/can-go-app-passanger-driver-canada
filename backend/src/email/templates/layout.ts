export function layout(content: string, assetBaseUrl: string): string {
  const year = new Date().getFullYear();
  const logoUrl = `${assetBaseUrl}/logo.png`;
  
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@900&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  body { margin: 0; padding: 0; font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f3f4f6; color: #111827; }
  .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
  .header { background: #ffffff; padding: 24px; text-align: center; border-bottom: 2px solid #E50000; }
  .header img { height: 48px; display: block; margin: 0 auto; }
  .content { padding: 32px; font-size: 16px; line-height: 1.6; }
  .content h2 { font-family: 'Montserrat', sans-serif; font-weight: 900; color: #000000; }
  .footer { background: #f9fafb; padding: 24px; text-align: center; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb; }
  .btn { display: inline-block; background: #E50000; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 700; font-size: 16px; margin: 24px 0; text-align: center; }
  .value-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
  .otp-code { font-size: 36px; font-weight: 700; letter-spacing: 4px; color: #111827; }
  .receipt-row { display: table-row; }
  .receipt-row td { padding: 12px 0; border-bottom: 1px dashed #e5e7eb; }
  .receipt-row:last-child td { border-bottom: none; }
  .receipt-total td { font-weight: 700; font-size: 18px; border-top: 2px solid #111827; padding-top: 16px; }
  .alert-box { background: #fef2f2; border: 1px solid #f87171; border-radius: 8px; padding: 16px; margin: 20px 0; color: #991b1b; }
  .success-box { background: #ecfdf5; border: 1px solid #34d399; border-radius: 8px; padding: 16px; margin: 20px 0; color: #065f46; }
  table.receipt-table { width: 100%; border-collapse: collapse; }
  table.receipt-table td:last-child { text-align: right; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <img src="${logoUrl}" alt="CAN-RIDE" />
  </div>
  <div class="content">
    ${content}
  </div>
  <div class="footer">
    <p><strong>This is an automated message, please do not reply to this email.</strong></p>
    <p>Questions? Contact support@can-rides.ca.</p>
    <p>&copy; ${year} CAN-RIDE Canada. All rights reserved.</p>
  </div>
</div>
</body>
</html>
  `.trim();
}

export function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return unsafe
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}